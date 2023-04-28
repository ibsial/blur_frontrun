import { blur_abi } from "./blur.js";
import { ethers } from "ethers";
import { Network, Alchemy } from "alchemy-sdk";
import * as dotenv from 'dotenv';
dotenv.config();
const settings = {
    apiKey: "", // Replace with your Alchemy API Key.
    network: Network.ETH_MAINNET, // Replace with your network.
  };
  
const wsProvider = new Alchemy(settings);
const httpsProvider = new ethers.providers.JsonRpcProvider("https://eth-mainnet.g.alchemy.com/v2/", 1)
const blurMarketAddress = "0x000000000000Ad05Ccc4F10045630fb830B95127";
const actor = "address";
const signer = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, httpsProvider);
let actorNonce;
let bigFeePerGas;
let bigPriorityFeePerGas;
// which transactions are tracked
const pendingFilter = {
  method: "alchemy_pendingTransactions",
  toAddress: blurMarketAddress,
};
const increaseNonce = () => {
  actorNonce = actorNonce + 1;
}
const cancelOrderTx = function(cancelOrderData) {
  signer.signTransaction({
    to: blurMarketAddress,
    from: actor,
    value: 0,
    gasLimit: "0x186A0", // 60k for cancellation. Passing 100k just in case..
    maxFeePerGas: bigFeePerGas._hex,
    maxPriorityFeePerGas: bigPriorityFeePerGas._hex,
    nonce: actorNonce,
    data: ethers.utils.arrayify(cancelOrderData),
    type: 2,
    chainId: 1,
  })
  .then(function (signedTx) {
    return signer.sendTransaction(signedTx);
  }, (error) => { //catch
    console.log("error while sending");
    console.log(error);
  })
  .then( function (txResponse) {
    console.log("frontrun tx sent!")
    console.log(txResponse)
  }, (error) => { //catch
    console.log("error getting tx response")
    console.log(error)
  })
  .then(function (txResponse) {
    return httpsProvider.waitForTransaction(txResponse.hash);
  })
  .then(() => {
    increaseNonce();
  })
}


const checkFrontrunOpportunity = function(txn) {
  let data = txn.input;
  const blur = new ethers.utils.Interface(blur_abi);
  let order = blur.parseTransaction({data}).args;

  // NOT TESTED EXECUTE FRONTRUN, BUT SEEMS TO BE STABLE (LOL)

    if (data.toString().includes("0x9a1fc3a7")) { // execute
      console.log("trying to cancel execute TX");
      console.log(txn.hash);
      if (order.buy.order[0] == actor) {
        bigFeePerGas = ethers.BigNumber.from(txn.maxFeePerGas).mul("15").div("10");
        bigPriorityFeePerGas = ethers.BigNumber.from(txn.maxPriorityFeePerGas).mul("20").div("10");
        console.log(bigFeePerGas, bigPriorityFeePerGas);
        let buy = blur.parseTransaction({data}).args.buy;
        let cancelOrderData = blur.encodeFunctionData("cancelOrder", [buy.order]);
        console.log("triggered buy cancellation");
        cancelOrderTx(cancelOrderData);
      } else if (order.sell.order[0] == actor) {
        bigFeePerGas = ethers.BigNumber.from(txn.maxFeePerGas).mul("15").div("10");
        bigPriorityFeePerGas = ethers.BigNumber.from(txn.maxPriorityFeePerGas).mul("15").div("10");
        console.log(bigFeePerGas, bigPriorityFeePerGas);
        let sell = blur.parseTransaction({data}).args.sell;
        let cancelOrderData = blur.encodeFunctionData("cancelOrder", [sell.order]);
        console.log("triggered sell cancellation");
        cancelOrderTx(cancelOrderData);
      }
    }
    else if (data.toString().includes("0xb3be57f8")) { // bulk execute
      console.log("trying to cancel bulkExecute TX");
      console.log(txn);
      let bulkExecute = blur.parseTransaction({data});
      for (let i = 0; i < bulkExecute.args.executions.length; i++) {
        if (bulkExecute.args.executions[i].buy[0].trader == actor) {
          bigFeePerGas = ethers.BigNumber.from(txn.maxFeePerGas).mul("15").div("10");
          bigPriorityFeePerGas = ethers.BigNumber.from(txn.maxPriorityFeePerGas).mul("20").div("10");
          let buy = bulkExecute.args.executions[i].buy;
          let cancelOrderData = blur.encodeFunctionData("cancelOrder", [buy.order]);
          console.log("triggered bulk buy cancellation");
          cancelOrderTx(cancelOrderData);
        }
        if (bulkExecute.args.executions[i].sell[0].trader == actor) {
          bigFeePerGas = ethers.BigNumber.from(txn.maxFeePerGas).mul("15").div("10");
          bigPriorityFeePerGas = ethers.BigNumber.from(txn.maxPriorityFeePerGas).mul("20").div("10");
          let sell = bulkExecute.args.executions[i].sell;
          let cancelOrderData = blur.encodeFunctionData("cancelOrder", [sell.order]);
          console.log("triggered bulk sell cancellation");
          cancelOrderTx(cancelOrderData);
        }
      }
    }
}

// Open the websocket and listen for events!
wsProvider.ws.on(pendingFilter, checkFrontrunOpportunity);

async function main() {
  actorNonce = await httpsProvider.getTransactionCount(actor);
  const blur = new ethers.utils.Interface(blur_abi);
  console.log(blur.getSighash("bulkExecute"));
}
main()