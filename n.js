const startTime = Date.now();

// Run a loop or a heavy function
for (let i = 0; i < 1000000; i++) {
  // Doing some heavy lifting...
}

const endTime = Date.now();
const timeElapsed = endTime - startTime;

console.log(`The loop took ${timeElapsed} milliseconds.`);

const currentTimestamp = Date.now();
console.log(currentTimestamp); 
// Output looks like: 1789979000000 (a 13-digit number)

