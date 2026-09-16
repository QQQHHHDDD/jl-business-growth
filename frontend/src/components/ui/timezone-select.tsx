import { useId, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { isSupportedTimezone, supportedTimezones } from "@/lib/timezones";

export function TimezoneSelect({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const listID = useId();
  const options = useMemo(() => supportedTimezones(value), [value]);
  const validationError = value && !isSupportedTimezone(value) ? "请从列表中选择有效的 IANA 时区" : error;
  return <>
    <Input
      label="IANA 时区"
      role="combobox"
      aria-autocomplete="list"
      list={listID}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={validationError}
      autoComplete="off"
      required
    />
    <datalist id={listID}>{options.map((timezone) => <option key={timezone} value={timezone} />)}</datalist>
  </>;
}
