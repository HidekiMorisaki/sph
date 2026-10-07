/** Choose readable 1/2/5 × 10ⁿ steps while keeping roughly four to six intervals. */
export function niceAxis(values: number[], minimumStep = 1) {
	const highest = Math.max(0, ...values.filter(Number.isFinite));
	const floor = Number.isFinite(minimumStep) && minimumStep > 0 ? minimumStep : 1;
	const lowerPower = Math.floor(Math.log10(floor)) - 1;
	const upperPower = Math.ceil(Math.log10(Math.max(highest, floor))) + 1;
	let best: { step: number; intervals: number; maximum: number; penalty: number; excess: number } | null = null;
	for (let power = lowerPower; power <= upperPower; power++) {
		for (const multiplier of [1, 2, 5]) {
			const step = multiplier * 10 ** power;
			if (step < floor - Number.EPSILON) continue;
			const intervals = Math.max(1, Math.ceil(highest / step));
			const maximum = Number((intervals * step).toPrecision(12));
			const penalty = intervals < 4 ? 4 - intervals : intervals > 6 ? intervals - 6 : 0;
			const excess = (maximum - highest) / Math.max(highest, floor);
			if (!best || penalty < best.penalty || penalty === best.penalty && (excess < best.excess || excess === best.excess && Math.abs(intervals - 5) < Math.abs(best.intervals - 5))) {
				best = { step, intervals, maximum, penalty, excess };
			}
		}
	}
	const axis = best!;
	return { maximum: axis.maximum, ticks: Array.from({ length: axis.intervals + 1 }, (_, index) => Number((index * axis.step).toPrecision(12))) };
}
