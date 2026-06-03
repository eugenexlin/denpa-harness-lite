export interface DailyStats {
  id: number;
  date: string;
  total_duration_ms: number;
  tokens_in: number;
  tokens_out: number;
  request_count: number;
}
