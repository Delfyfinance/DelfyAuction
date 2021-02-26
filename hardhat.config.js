// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
require("@nomiclabs/hardhat-truffle5");

// task action function receives the Hardhat Runtime Environment as second argument
task("accounts", "Prints accounts", async (_, { web3 }) => {
  console.log(await web3.eth.getAccounts());
});

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.6.6",
      },
      {
        version: "0.5.16",
      },
      {
        version: "0.6.12",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
        },
      },
    ],
  },
  allowUnlimitedContractSize: true,
  mocha: {
    timeout: 200000,
  },
};
