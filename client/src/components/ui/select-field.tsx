import * as React from "react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Radix <SelectItem> does not allow an empty-string value, but several forms
// use "" for "nothing selected". Map it to a sentinel on the way in and back
// to "" on the way out so callers keep their existing state shape.
const EMPTY_VALUE = "__empty__"

export interface SelectFieldOption {
  value: string
  label: React.ReactNode
  disabled?: boolean
}

export interface SelectFieldGroup {
  group: string
  items: SelectFieldOption[]
}

export interface SelectFieldProps {
  value: string
  onValueChange: (value: string) => void
  options: Array<SelectFieldOption | SelectFieldGroup>
  placeholder?: string
  className?: string
  disabled?: boolean
  "aria-label"?: string
}

function isGroup(
  option: SelectFieldOption | SelectFieldGroup,
): option is SelectFieldGroup {
  return "group" in option
}

function renderItem(option: SelectFieldOption) {
  return (
    <SelectItem
      key={option.value}
      value={option.value === "" ? EMPTY_VALUE : option.value}
      disabled={option.disabled}
    >
      {option.label}
    </SelectItem>
  )
}

/**
 * Drop-in replacement for a native <select>: same value / change contract,
 * but renders the styled Radix list instead of the operating-system popup.
 * Pass `className` to size the trigger (e.g. "h-8 text-xs").
 */
export function SelectField({
  value,
  onValueChange,
  options,
  placeholder,
  className,
  disabled,
  "aria-label": ariaLabel,
}: SelectFieldProps) {
  return (
    <Select
      value={value === "" ? EMPTY_VALUE : value}
      onValueChange={(next) => onValueChange(next === EMPTY_VALUE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger className={className} aria-label={ariaLabel}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) =>
          isGroup(option) ? (
            <SelectGroup key={option.group}>
              <SelectLabel>{option.group}</SelectLabel>
              {option.items.map(renderItem)}
            </SelectGroup>
          ) : (
            renderItem(option)
          ),
        )}
      </SelectContent>
    </Select>
  )
}

export default SelectField
