export interface DroneFleetUnit {
  id: string;
  name: string;
  model: string;
  baseLat: number;
  baseLng: number;
  maxPayloadKg: number;
}

export const DRONE_FLEET: DroneFleetUnit[] = [
  {
    id: "DRN-402",
    name: "KICC Alpha",
    model: "AeroMed X4",
    baseLat: -1.2921,
    baseLng: 36.8219,
    maxPayloadKg: 4.5,
  },
  {
    id: "DRN-417",
    name: "Upperhill Beta",
    model: "AeroMed X4",
    baseLat: -1.3007,
    baseLng: 36.8155,
    maxPayloadKg: 4.5,
  },
  {
    id: "DRN-431",
    name: "Westlands Gamma",
    model: "AeroMed Scout",
    baseLat: -1.2645,
    baseLng: 36.8026,
    maxPayloadKg: 3.2,
  },
  {
    id: "DRN-448",
    name: "Industrial Delta",
    model: "AeroMed Cargo",
    baseLat: -1.3141,
    baseLng: 36.8499,
    maxPayloadKg: 6.0,
  },
  {
    id: "DRN-463",
    name: "Langata Echo",
    model: "AeroMed X4",
    baseLat: -1.3521,
    baseLng: 36.7544,
    maxPayloadKg: 4.5,
  },
];

export const DEFAULT_DRONE_ID = DRONE_FLEET[0].id;
