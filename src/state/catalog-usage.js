export function createItemUsageCounts(items, {
  matchesItem = () => true,
  isAwayFromHomeAndBike = () => false,
  isWithoutWeight = () => false,
  isInCurrentLayout = () => false
} = {}) {
  return items.filter(matchesItem).reduce(
    (counts, item) => {
      counts.all += 1;
      if (isAwayFromHomeAndBike(item)) counts.away += 1;
      if (isWithoutWeight(item)) counts.noWeight += 1;
      if (isInCurrentLayout(item)) {
        counts.current += 1;
      } else {
        counts.unused += 1;
      }
      return counts;
    },
    { all: 0, current: 0, away: 0, noWeight: 0, unused: 0 }
  );
}

export function createRootContainerUsageCounts(containers, {
  isEligible = () => true,
  isInCurrentLayout = () => false
} = {}) {
  return containers.filter(isEligible).reduce(
    (counts, container) => {
      counts.all += 1;
      if (isInCurrentLayout(container.id)) counts.current += 1;
      else counts.unused += 1;
      return counts;
    },
    { all: 0, current: 0, unused: 0 }
  );
}
