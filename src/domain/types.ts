export type WeekdayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type RemarkPreset =
  | ''
  | 'Urlaub'
  | 'krank'
  | 'Zeitkonto'
  | 'AZVO'
  | 'Ausgleichstag'
  | 'Feiertag'
  | 'Rufbereitschaft';

export type HolidayRegion =
  | 'BW'
  | 'BY'
  | 'BE'
  | 'BB'
  | 'HB'
  | 'HH'
  | 'HE'
  | 'MV'
  | 'NI'
  | 'NW'
  | 'RP'
  | 'SL'
  | 'SN'
  | 'ST'
  | 'SH'
  | 'TH';

export interface WeekdaySetting {
  targetMinutes: number;
  workAllowed: boolean;
}

export type MinusCountingMode = 'planned_days' | 'explicit_only';

export interface TrafficThresholds {
  plusGreenUntilMinutes: number;
  plusYellowUntilMinutes: number;
  plusRedFromMinutes: number;
  minusGreenUntilMinutes: number;
  minusYellowUntilMinutes: number;
  minusRedFromMinutes: number;
}

export type BackgroundImageOption = 'none' | 'pexels-arlind' | 'pexels-magnus' | 'pexels-masood';
export type PdfExportLayout = 'gleito' | 'stadt-mannheim';

export interface Settings {
  employeeName: string;
  dienststelle: string;
  kostenstelle: string;
  personalNumber: string;
  department: string;
  trackingStartMonth: string;
  currentWorkMonth: string;
  holidayRegion: HolidayRegion;
  customHolidays: string[];
  weekdays: Record<WeekdayKey, WeekdaySetting>;
  initialCarryoverMinutes: number;
  overtimeLimitMinutes: number;
  minusCountingMode: MinusCountingMode;
  trafficThresholds: TrafficThresholds;
  backgroundEnabled: boolean;
  translucentSurfaces: boolean;
  highlightOpenPlannedDays: boolean;
  backgroundImage: BackgroundImageOption;
  rotateBackgrounds: boolean;
  surfaceOpacity: number;
  tableOpacity: number;
  windowTransparency: number;
  warnBeforeSix: boolean;
  warnAfterSix: boolean;
  roundToTenMinutes: boolean;
  pdfExportLayout: PdfExportLayout;
  hasCanteenAccess: boolean;
  setupGuideCompleted: boolean;
}

export interface DayEntry {
  date: string;
  start: string;
  end: string;
  pause: string;
  pauseManual: boolean;
  endManual: boolean;
  remark: string;
}

export interface CalculatedDay extends DayEntry {
  weekday: WeekdayKey;
  weekdayLabel: string;
  holidayName: string;
  targetMinutes: number;
  actualMinutes: number;
  plusMinutes: number;
  minusMinutes: number;
  warnings: string[];
  editable: boolean;
}

export interface MonthSummary {
  monthKey: string;
  carryInMinutes: number;
  plusMinutes: number;
  minusMinutes: number;
  monthDeltaMinutes: number;
  saldoMinutes: number;
  trafficLight: 'green' | 'yellow' | 'red';
  warningCount: number;
}

export interface MonthData {
  days: DayEntry[];
}
