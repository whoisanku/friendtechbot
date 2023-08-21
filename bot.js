const ethers = require('ethers');
const fs = require('fs');
require("dotenv").config();

const friendsAddress = '0xCF205808Ed36593aa40a44F10c7f7C2F67d4A4d4';
const url = process.env.WEBSOCKET_URL;
const provider = new ethers.WebSocketProvider(url);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
const account = wallet.connect(provider);

const friends = new ethers.Contract(
  friendsAddress,
  [
    'function buyShares(address arg0, uint256 arg1)',
    'function getBuyPriceAfterFee(address sharesSubject, uint256 amount) public view returns (uint256)',
    'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)',
  ],
  account
);

const gasPrice = ethers.parseUnits('0.000000000000049431', 'ether');
const FOLLOW_NUM = 50000;  // Adjust this number as per your requirement.
const balanceArray = [];

const isNewAccount = ({ traderAddress, subjectAddress, isBuy, ethAmount, shareAmount, supply }) => {
  return (
    traderAddress === subjectAddress &&
    isBuy &&
    ethAmount === '0.0' &&
    shareAmount.eq(ethers.BigNumber.from(1)) &&
    supply.eq(ethers.BigNumber.from(1))
  );
};

const run = async () => {
  let filter = friends.filters.Trade(null, null, null, null, null, null, null, null);

  friends.on(filter, async (event) => {
    const details = {
      traderAddress: event.args[0],
      subjectAddress: event.args[1],
      isBuy: event.args[2],
      ethAmount: event.args[4].toString(),
      shareAmount: event.args[3],
      supply: event.args[7]
    };
    if (details.isBuy && isNewAccount(details)) {
      const amigo = event.args[1];
      const weiBalance = await provider.getBalance(amigo);

      for (const botBalance in balanceArray) {
        if (weiBalance > botBalance - 300000000000000 && weiBalance < botBalance + 300000000000000) {
          // console.log('Bot detected: ', amigo);
          return;
        }
      }

      if (weiBalance > 95000000000000000 && weiBalance < 105000000000000000) return;
      balanceArray.push(weiBalance);
      if (balanceArray.length > 20) balanceArray.shift();

      const userData = await getUserData(amigo);
      const twitterUsername = userData.twitterUsername;

      if (await hasFollowers(twitterUsername, FOLLOW_NUM)) {
        let qty = 1;
        if (weiBalance >= 90000000000000000) qty = 2;
        if (weiBalance >= 900000000000000000) qty = 3;

        const buyPrice = await friends.getBuyPriceAfterFee(amigo, qty);

        if ((qty < 2 && buyPrice > 2000000000000000) || buyPrice > 10000000000000000) return;

        console.log('### BUY ###', amigo, buyPrice);
        const tx = await friends.buyShares(amigo, qty, { value: buyPrice, gasPrice });
        fs.appendFileSync('./buys.txt', amigo + "\n");

        try {
          const receipt = await tx.wait();
          console.log('Transaction Mined:', receipt.blockNumber);
        } catch (error) {
          console.log('Transaction Failed:', error);
        }
      } else {
        console.log(`User ${amigo} (${twitterUsername}) does not meet the follower count requirement.`);
      }
    }
    else {
      console.log('Not a new user.')
    }
  });
}

async function hasFollowers({ subject }, followerNumber) {
  if (!subject || typeof subject !== "string") {
    // console.error("Invalid subject:", subject);
    return false;
  }

  if (!subject.startsWith('0x')) {
    const followers = await getTwitterFollowersCount(subject);
    if (followers > followerNumber) {
      console.log(`${subject} has ${followers} followers`);
      return true;
    }
  }
  return false;
}

async function getUserData(address) {
  try {
    const response = await fetch(`https://prod-api.kosetto.com/users/${address}`);
    if (response.ok) {
      const data = await response.json();
      return data || { twitterUsername: address };
    }
  } catch (err) {
    console.error(`Failed to fetch user data for address ${address}: ${err.message}`);
  }
  return { twitterUsername: address };
}

async function getTwitterFollowersCount(profileName) {
  const myHeaders = new Headers({
    "Authorization": `Bearer ${process.env.TWITTER_TOKEN}`
  });

  const requestOptions = {
    method: 'GET',
    headers: myHeaders,
    redirect: 'follow'
  };

  try {
    const response = await fetch(`https://api.twitter.com/1.1/users/lookup.json?screen_name=${profileName}`, requestOptions);
    if (response.ok) {
      const data = await response.json();
      return data[0].followers_count;
    }
  } catch (err) {
    console.error(`Failed to fetch follow count for ${profileName}: ${err.message}`);
  }
  return 0;
}

try {
  run();
} catch (error) {
  console.error('ERR:', error);
}

process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
});
