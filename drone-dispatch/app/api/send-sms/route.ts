import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type SmsProvider = 'africastalking' | 'twilio';
type SmsProviderPreference = SmsProvider | 'auto' | 'mock';

interface SMSRequestBody {
  phone?: string;
  customerName?: string;
  ticketId?: string;
  distanceMeters?: number;
}

interface ProviderResult {
  provider: SmsProvider;
  ok: boolean;
  status: number;
  data: unknown;
  error?: string;
}

const PROVIDER_ORDER: SmsProvider[] = ['africastalking', 'twilio'];

export async function GET() {
  const preference = getProviderPreference();

  return NextResponse.json({
    success: true,
    preference,
    providers: {
      africastalking: {
        configured: isAfricaTalkingConfigured(),
        environment: getAfricaTalkingEnvironment(),
        username: process.env.AT_USERNAME || null,
        hasSenderId: Boolean(process.env.AT_SENDER_ID),
      },
      twilio: {
        configured: isTwilioConfigured(),
        hasFromNumber: Boolean(process.env.TWILIO_PHONE),
      },
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SMSRequestBody;
    const phone = normalizePhone(body.phone);
    const ticketId = body.ticketId?.trim();

    if (!phone || !ticketId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: phone, ticketId' },
        { status: 400 }
      );
    }

    if (!isE164PhoneNumber(phone)) {
      return NextResponse.json(
        { success: false, error: 'Phone number must be in E.164 format, for example +254700000000' },
        { status: 400 }
      );
    }

    const message = buildDeliveryMessage({
      customerName: body.customerName,
      ticketId,
      distanceMeters: body.distanceMeters,
    });

    const preference = getProviderPreference();

    if (preference === 'mock') {
      return logMockSms({ phone, message, ticketId, distanceMeters: body.distanceMeters });
    }

    const providers = preference === 'auto' ? PROVIDER_ORDER : [preference];
    const errors: string[] = [];

    for (const provider of providers) {
      if (provider === 'africastalking') {
        if (!isAfricaTalkingConfigured()) {
          errors.push('Africa\'s Talking is missing AT_API_KEY or AT_USERNAME');
          continue;
        }

        const result = await sendWithAfricaTalking(phone, message);
        if (result.ok) {
          return NextResponse.json({ success: true, provider: result.provider, data: result.data });
        }

        errors.push(result.error || 'Africa\'s Talking failed');
        continue;
      }

      if (!isTwilioConfigured()) {
        errors.push('Twilio is missing TWILIO_ACCOUNT_SID/TWILIO_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE');
        continue;
      }

      const result = await sendWithTwilio(phone, message);
      if (result.ok) {
        return NextResponse.json({ success: true, provider: result.provider, data: result.data });
      }

      errors.push(result.error || 'Twilio failed');
    }

    if (preference !== 'auto') {
      return NextResponse.json(
        { success: false, error: errors.join('; ') || 'Configured SMS provider failed' },
        { status: 502 }
      );
    }

    return logMockSms({ phone, message, ticketId, distanceMeters: body.distanceMeters, errors });
  } catch (err) {
    console.error('[SMS] API error:', err);
    return NextResponse.json(
      { success: false, error: 'SMS dispatch failed' },
      { status: 500 }
    );
  }
}

function buildDeliveryMessage({
  customerName,
  ticketId,
  distanceMeters,
}: {
  customerName?: string;
  ticketId: string;
  distanceMeters?: number;
}) {
  const name = customerName?.trim() || 'there';
  const shortTicket = ticketId.substring(0, 8).toUpperCase();
  const distance = typeof distanceMeters === 'number' ? Math.max(0, Math.round(distanceMeters)) : null;
  const locationHint = distance === null ? 'near your location' : `${distance}m away`;

  return `Drone Dispatch: Hi ${name}, your drone delivery ${shortTicket} is ${locationHint}. Please prepare for package drop-off.`;
}

function normalizePhone(phone: string | undefined) {
  const compact = phone?.replace(/[^\d+]/g, '').trim();

  if (!compact) return '';
  if (compact.startsWith('+')) return compact;
  if (compact.startsWith('0')) return `+${getDefaultCountryCode()}${compact.slice(1)}`;
  if (compact.startsWith(getDefaultCountryCode())) return `+${compact}`;

  return compact;
}

function isE164PhoneNumber(phone: string) {
  return /^\+[1-9]\d{7,14}$/.test(phone);
}

function getDefaultCountryCode() {
  return process.env.SMS_DEFAULT_COUNTRY_CODE?.replace(/\D/g, '') || '254';
}

function getProviderPreference(): SmsProviderPreference {
  const value = process.env.SMS_PROVIDER?.trim().toLowerCase();

  if (value === 'africastalking' || value === 'twilio' || value === 'mock') {
    return value;
  }

  return 'auto';
}

function isAfricaTalkingConfigured() {
  return Boolean(process.env.AT_API_KEY && process.env.AT_USERNAME);
}

function getAfricaTalkingEnvironment() {
  const value = process.env.AT_ENV?.trim().toLowerCase();

  if (value === 'live' || value === 'production') return 'live';
  if (value === 'sandbox' || process.env.AT_USERNAME === 'sandbox') return 'sandbox';

  return 'live';
}

function getAfricaTalkingEndpoint() {
  return getAfricaTalkingEnvironment() === 'sandbox'
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
}

async function sendWithAfricaTalking(phone: string, message: string): Promise<ProviderResult> {
  const body = new URLSearchParams({
    username: process.env.AT_USERNAME || '',
    to: phone,
    message,
  });

  if (process.env.AT_SENDER_ID) {
    body.set('from', process.env.AT_SENDER_ID);
  }

  const response = await fetch(getAfricaTalkingEndpoint(), {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      apiKey: process.env.AT_API_KEY || '',
    },
    body,
  });

  const data = await readProviderResponse(response);

  return {
    provider: 'africastalking',
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? undefined : getProviderError(data, response.statusText),
  };
}

function isTwilioConfigured() {
  return Boolean(getTwilioAccountSid() && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE);
}

function getTwilioAccountSid() {
  return process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_SID;
}

async function sendWithTwilio(phone: string, message: string): Promise<ProviderResult> {
  const accountSid = getTwilioAccountSid() || '';
  const twilioAuth = Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${twilioAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: phone,
        From: process.env.TWILIO_PHONE || '',
        Body: message,
      }),
    }
  );

  const data = await readProviderResponse(response);

  return {
    provider: 'twilio',
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? undefined : getProviderError(data, response.statusText),
  };
}

async function readProviderResponse(response: Response) {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function getProviderError(data: unknown, fallback: string) {
  if (typeof data === 'string') return data;
  if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') {
    return data.message;
  }

  return fallback || 'SMS provider request failed';
}

function logMockSms({
  phone,
  message,
  ticketId,
  distanceMeters,
  errors = [],
}: {
  phone: string;
  message: string;
  ticketId: string;
  distanceMeters?: number;
  errors?: string[];
}) {
  console.log('===============================================');
  console.log('[SMS] MOCK NOTIFICATION - no provider sent a real SMS');
  console.log(`To: ${phone}`);
  console.log(`Message: ${message}`);
  console.log(`Ticket: ${ticketId}`);
  console.log(`Distance: ${typeof distanceMeters === 'number' ? Math.round(distanceMeters) : 'unknown'}m`);
  if (errors.length > 0) console.log(`Provider notes: ${errors.join('; ')}`);
  console.log('===============================================');

  return NextResponse.json({
    success: true,
    provider: 'mock',
    message: 'SMS logged to server console. Configure Africa\'s Talking or Twilio env vars to send real SMS.',
    errors,
  });
}
