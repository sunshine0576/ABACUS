const { buildCalcSteps } = require("./calc-planner");
const { deriveDisplaySteps } = require("./display-planner");

function simulate(problem) {
  const calcSteps = buildCalcSteps(problem);
  const displaySteps = deriveDisplaySteps(calcSteps, { includeExplain: true });
  return { calcSteps, displaySteps };
}

function printSimulation(problem) {
  const { calcSteps, displaySteps } = simulate(problem);
  const expression = `${problem.left} ${problem.op} ${problem.right}`;
  console.log(`\n=== ${expression} ===`);
  console.log("CalcSteps:");
  console.log(JSON.stringify(calcSteps, null, 2));
  console.log("DisplaySteps:");
  console.log(JSON.stringify(displaySteps, null, 2));
}

if (require.main === module) {
  const cases = [
    { left: 12, op: "+", right: 23 },
    { left: 27, op: "+", right: 18 },
    { left: 23, op: "-", right: 18 },
    { left: 50, op: "-", right: 27 }
  ];
  cases.forEach(printSimulation);
}

module.exports = {
  deriveDisplayStepsNumeric: deriveDisplaySteps,
  simulate
};

