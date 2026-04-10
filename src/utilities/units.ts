export interface Duration {
  days: number;
  months: number;
  years: number;
}

export enum LengthUnit {
    Inches,
    Feet,
    Miles,
    Centimeters,
    Meters,
    Kilometers
}

export enum WeightUnit {
    Pounds,
    Kilograms,
    Tons,
    Tonnes
}

export interface Length {
    value: number,
    unit: LengthUnit
}

export interface Weight {
    value: number,
    unit: WeightUnit
}

export const conversionsToCm = {
    [LengthUnit.Centimeters]: 1,
    [LengthUnit.Meters]: 100,
    [LengthUnit.Feet]: 30.48,
    [LengthUnit.Inches]: 2.54,
    [LengthUnit.Kilometers]: 100000,
    [LengthUnit.Miles]: 160934.4
}

export const conversionsToKg = {
    [WeightUnit.Kilograms]: 1,
    [WeightUnit.Pounds]: 0.45359237,
    [WeightUnit.Tonnes]: 1000,
    [WeightUnit.Tons]: 907.18474
}

export function lengthConversion(value: number, startingUnit: LengthUnit, endingUnit: LengthUnit) {
    return (value * conversionsToCm[startingUnit] / conversionsToCm[endingUnit])
}

export function weightConversion(value: number, startingUnit: WeightUnit, endingUnit: WeightUnit) {
    return (value * conversionsToKg[startingUnit] / conversionsToKg[endingUnit])
}


export function convertLength(l: Length, targetIsImperial: boolean): Length {
    let conversionChart = {
        "imperial": {
            [LengthUnit.Centimeters]: LengthUnit.Inches,
            [LengthUnit.Meters]: LengthUnit.Feet,
            [LengthUnit.Kilometers]: LengthUnit.Miles,
            [LengthUnit.Inches]: LengthUnit.Inches,
            [LengthUnit.Feet]: LengthUnit.Feet,
            [LengthUnit.Miles]: LengthUnit.Miles,
        }, "metric": {
            [LengthUnit.Centimeters]: LengthUnit.Centimeters,
            [LengthUnit.Meters]: LengthUnit.Meters,
            [LengthUnit.Kilometers]: LengthUnit.Kilometers,
            [LengthUnit.Inches]: LengthUnit.Centimeters,
            [LengthUnit.Feet]: LengthUnit.Meters,
            [LengthUnit.Miles]: LengthUnit.Kilometers,
        }
    };
    let targetUnit = conversionChart[targetIsImperial ? "imperial" : "metric"][l.unit];
    if (targetUnit == l.unit) return l;
    return { unit: targetUnit, value: lengthConversion(l.value, l.unit, targetUnit) };
}

export function convertWeight(l: Weight, targetIsImperial: boolean): Weight {
    let conversionChart = {
        "imperial": {
            [WeightUnit.Kilograms]: WeightUnit.Pounds,
            [WeightUnit.Tonnes]: WeightUnit.Tons,
            [WeightUnit.Pounds]: WeightUnit.Pounds,
            [WeightUnit.Tons]: WeightUnit.Tons
        }, "metric": {
            [WeightUnit.Kilograms]: WeightUnit.Kilograms,
            [WeightUnit.Tonnes]: WeightUnit.Tonnes,
            [WeightUnit.Pounds]: WeightUnit.Kilograms,
            [WeightUnit.Tons]: WeightUnit.Tonnes
        }
    };
    let targetUnit = conversionChart[targetIsImperial ? "imperial" : "metric"][l.unit];
    if (targetUnit == l.unit) return l;
    return { unit: targetUnit, value: weightConversion(l.value, l.unit, targetUnit) };
}



export function displayLength(l: Length, imperial: boolean) {

    let cmValue = l.value * conversionsToCm[l.unit];
    let big = cmValue > 150000;

    if (big && imperial) return `${+(cmValue / conversionsToCm[LengthUnit.Miles]).toFixed(2)} miles`;
    if (!big && imperial) {
        let totalIns = cmValue / conversionsToCm[LengthUnit.Inches];
        let feet = Math.floor(totalIns / 12);
        let ins = Math.floor(totalIns - feet * 12);
        return feet > 0 ? `${feet} ft${(ins > 0) ? ` ${ins} in` : ``}` : `${ins} in`;
    }
    if (big && !imperial) return `${+(cmValue / conversionsToCm[LengthUnit.Kilometers]).toFixed(2)} km`;
    if (!big && !imperial) {
        if (cmValue < 300)
            return `${cmValue.toFixed(0)} cm`;
        let meters = Math.floor(cmValue / 100);
        let cms = Math.floor(cmValue - 100 * meters);
        return `${meters} m ${cms} cm`;
    }

}

export function displayWeight(w: Weight, imperial: boolean) {

    let kgValue = w.value * conversionsToKg[w.unit];
    let big = kgValue > 1500;
    let veryBig = kgValue > 1500000;

    if (veryBig && imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Tons] / 1000).toFixed(2)} kilotons`;
    if (big && imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Tons]).toFixed(2)} tons`;
    if (!big && imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Pounds]).toFixed(2)} lbs.`;

    if (veryBig && !imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Tonnes] / 1000).toFixed(2)} kilotonnes`;
    if (big && !imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Tonnes]).toFixed(2)} tonnes`;
    if (!big && !imperial) return `${+(kgValue / conversionsToKg[WeightUnit.Kilograms]).toFixed(2)} kg`;

}

export let formatDuration = (years: number) =>
  years > 1000 * 100
    ? `${Math.round(years / 1000)} Millenia`
    : years > 1000
      ? `${Math.round(years / 100)} Centuries`
      : `${Math.round(years)} Years`;

export const timeSince = (date: Date) => {
  let daysSince = ((new Date()).valueOf() - date.valueOf()) / (1000 * 60 * 60 * 24);
  if (daysSince <= 1)
    return "Today";
  if (daysSince <= 2)
    return "Yesterday";
  if (daysSince <= 7)
    return `${Math.round(daysSince)} Days Ago`;
  if (daysSince <= 14)
    return `Last Week`;
  if (daysSince <= 30)
    return `${Math.round(daysSince / 7)} Weeks Ago`;
  if (daysSince <= 60)
    return `Last Month`;
  if (daysSince <= 365)
    return `${Math.round(daysSince / 30.5)} Months Ago`;
  if (daysSince <= 365 * 2)
    return `Last Year`;
  return "A Long Time Ago"
}
export const addDurations: (a: Duration, b: Duration) => Duration = (a, b) => {
    let days = (a.days + b.days) % 30, daysOverflow = Math.floor((a.days + b.days) / 30);
    let months = (a.months + b.months + daysOverflow) % 12, monthsOverflow = Math.floor((a.months + b.months + daysOverflow) % 12);
    let years = a.years + b.years + monthsOverflow;
    return { days, months, years };
};
