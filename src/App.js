import "bootstrap/dist/css/bootstrap.min.css";
import "./styles/App.css";
import twitterLogo from "./assets/twitter-logo.svg";
import React, { useEffect, useState, useCallback } from "react";
import { ethers } from "ethers";
import theBillboard from "./utils/TheBillboard.json";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import WalletModal from "./Components/WalletModal";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Create a connector
const connector = new WalletConnect({
  bridge: "https://bridge.walletconnect.org", // Required
  qrcodeModal: QRCodeModal,
});

const connectWithWalletConnect = () => {
  if (!connector.connected) {
    connector.createSession();
  }
};

const wProvider = new WalletConnectProvider({
  rpc: {
    4: "https://eth-rinkeby.alchemyapi.io/v2/snXM9nAmIII5xnQzaQfszYFx7lBnRgNK",
  },
});

const constants = {
  METAMASK: "metamask",
  WALLET_CONNECT: "walletconnect",
};

const TWITTER_HANDLE = "slavcats";
const TWITTER_LINK = `https://twitter.com/${TWITTER_HANDLE}`;
const CONTRACT_ADDRESS = "0xA384435C0a70873DA9872f1C5Ae6795e5A4a93A8";
const OPENSEA_LINK = `https://testnets.opensea.io/assets/${CONTRACT_ADDRESS}/1`;
//const NETWORK = "homestead";

const App = () => {
  const [formData, setFormData] = useState({});
  const [currentAccount, setCurrentAccount] = useState("");
  const [currentBillboard, setCurrentBillboard] = useState();
  const [pastBillboards, setPastBillboards] = useState([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [wProviderEnabled, setWProviderEnabled] = useState(false);
  const [walletType, setWalletType] = useState(""); //metamask or walletconnect

  const handleClose = () => setShow(false);
  const handleShow = () => setShow(true);

  useEffect(() => {
    if (connector.accounts[0]) {
      console.log(connector.accounts);
      setCurrentAccount(connector.accounts[0]);
      setWalletType(constants.WALLET_CONNECT);
    } else {
      connector.on("connect", (error, payload) => {
        if (error) {
          throw error;
        } else {
          const { accounts, chainId } = payload.params[0];
          console.log(accounts, chainId);
          if (accounts[0]) {
            setCurrentAccount(accounts[0]);
            setWalletType(constants.WALLET_CONNECT);
            handleClose();
          }
        }
      });

      wProvider.onConnect((payload) => {
        const { accounts, chainId } = payload;
        console.log(accounts, chainId);
        if (accounts[0]) {
          setCurrentAccount(accounts[0]);
          setWalletType(constants.WALLET_CONNECT);
          handleClose();
        }
      });

      connector.on("session_update", (error, payload) => {
        if (error) {
          throw error;
        }
        const { accounts, chainId } = payload.params[0];
        console.log(accounts, chainId);
        if (accounts[0]) {
          setCurrentAccount(accounts[0]);
          setWalletType(constants.WALLET_CONNECT);
        }
      });

      wProvider
        .onDisconnect()
        .then((res) => {
          console.log(res);
        })
        .catch((err) => {
          console.log(err);
        });

      connector.on("disconnect", (error, payload) => {
        if (error) {
          throw error;
        } else {
          console.log("disconnected", payload);
          setCurrentAccount("");
        }
      });
    }
  }, []);

  const decodeFromBase64 = (encoded) => {
    // Going backwards: from bytestream, to percent-encoding, to original string.
    return decodeURIComponent(
      window
        .atob(encoded)
        .split("")
        .map(function (c) {
          return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join("")
    );
  };

  const checkIfWalletIsConnected = async () => {
    setIsLoading(true);
    const { ethereum } = window;

    if (!ethereum) {
      console.log("Make sure you have metamask!");
      return;
    } else {
      console.log("We have the ethereum object", ethereum);
    }

    const accounts = await ethereum.request({ method: "eth_accounts" });
    setIsLoading(false);
    if (accounts.length !== 0) {
      const account = accounts[0];
      console.log("Found an authorized account:", account);
      setCurrentAccount(account);
    } else {
      console.log("No authorized account found");
    }
  };

  const getCurrentBillboard = useCallback(async (event) => {
    try {
      setIsLoading(true);
      const { ethereum } = window;
      let provider = null;
      if (ethereum) {
        provider = new ethers.providers.Web3Provider(ethereum);
      } else {
        if (!wProviderEnabled) {
          await wProvider.enable();
        } else {
          setWProviderEnabled(true);
        }
        provider = new ethers.providers.Web3Provider(wProvider);
      }
      const connectedContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        theBillboard.abi,
        provider
      );

      let uri = await connectedContract.tokenURI(1);
      const json = window.atob(uri.substring(29));
      const result = JSON.parse(json);
      const base64Svg = result.image.split("base64,")[1];
      const svg = decodeFromBase64(base64Svg);
      const price = await connectedContract.getCurrentPriceInWeis();
      setCurrentBillboard({
        svg,
        price,
        hash: event ? event.transactionHash : "",
      });
      setFormData({ ...formData, price: ethers.BigNumber.from(price).add(1) });
    } catch (error) {
      console.log("error", error);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getPastBillboards = useCallback(async () => {
    try {
      const { ethereum } = window;
      let provider = null;
      if (ethereum) {
        provider = new ethers.providers.Web3Provider(ethereum);
      } else {
        if (!wProviderEnabled) {
          await wProvider.enable();
        } else {
          setWProviderEnabled(true);
        }
        provider = new ethers.providers.Web3Provider(wProvider);
      }
      const connectedContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        theBillboard.abi,
        provider
      );

      // Saving past texts
      let eventFilter = connectedContract.filters.BillboardUpdated();
      let events = await connectedContract.queryFilter(eventFilter);
      console.log(events);
      const latestEvent = events[events.length - 1];
      getCurrentBillboard(latestEvent);

      events.map(async (event) => {
        setPastBillboards((oldState) => [
          ...oldState,
          {
            price: event.args.price,
            hash: event.transactionHash,
            text: [event.args.first, event.args.second, event.args.third].join(
              " "
            ),
          },
        ]);
      });
    } catch (error) {
      console.log("error", error);
    }
  }, [getCurrentBillboard, wProviderEnabled]);

  /*
   * Implement your connectWallet method here
   */
  const connectWallet = async () => {
    try {
      const { ethereum } = window;

      if (!ethereum) {
        alert("Get MetaMask!");
        return;
      }

      const accounts = await ethereum.request({
        method: "eth_requestAccounts",
      });

      console.log("Connected", accounts[0]);
      setCurrentAccount(accounts[0]);
      handleClose();
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    // Setup our listener.
    const setupEventListener = async () => {
      try {
        const { ethereum } = window;

        let provider = null;
        if (ethereum) {
          provider = new ethers.providers.Web3Provider(ethereum);
        } else {
          if (!wProviderEnabled) {
            console.log(wProviderEnabled);
            await wProvider.enable();
          } else {
            console.log(wProviderEnabled);
            setWProviderEnabled(true);
          }
          provider = new ethers.providers.Web3Provider(wProvider);
        }

        const connectedContract = new ethers.Contract(
          CONTRACT_ADDRESS,
          theBillboard.abi,
          provider
        );

        connectedContract.on("BillboardUpdated", () => {
          setPastBillboards([]);
          console.log("getting billboard");
          getPastBillboards();
        });

        console.log("Setup event listener!");
      } catch (error) {
        console.log(error);
      }
    };

    checkIfWalletIsConnected();
    setupEventListener();
    console.log("getting billboard");
    getPastBillboards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderNotConnectedContainer = () => (
    <button onClick={handleShow} className="cta-button connect-wallet-button">
      Connect Wallet to Update
    </button>
  );

  const renderBillboard = () => {
    if (currentBillboard) {
      return (
        <>
          <div
            className="billboard-container"
            dangerouslySetInnerHTML={{ __html: currentBillboard.svg }}
          />
          <p className="simple-texts2">
            Last price paid to update:{" "}
            <a
              target="_blank"
              href={`https://etherscan.io/tx/${currentBillboard.hash}`}
              rel="noreferrer"
            >
              {`${ethers.utils.formatEther(currentBillboard.price)}`}Ξ
            </a>
          </p>
        </>
      );
    }
  };

  const renderPastBillboards = () => {
    if (pastBillboards.length > 1) {
      const sortedPastBillboards = pastBillboards.sort((a, b) => {
        if (a.price.lt(b.price)) {
          return 1;
        }
        if (a.price.gt(b.price)) {
          return -1;
        }
        return 0;
      });

      const previousBillboards = sortedPastBillboards
        .slice(1)
        .map((billboard, index) => (
          <p key={index}>
            {billboard.text}{" "}
            <a
              target="_blank"
              href={`https://etherscan.io/tx/${billboard.hash}`}
              rel="noreferrer"
            >
              {ethers.utils.formatEther(billboard.price)}Ξ
            </a>
          </p>
        ));
      return (
        <>
          <h2 className="simple-texts">Previous Billboards :</h2> {previousBillboards}{" "}
        </>
      );
    }
  };

  const renderForm = () => {
    if (
      currentBillboard &&
      currentBillboard.price &&
      formData &&
      formData.price
    ) {
      return (
        <>
          <form>
            <label className="simple-texts">
              Price in  Ξ  <br />
            </label>
            <input
              min="0"
              step="any"
              type="number"
              name="price"
              defaultValue={ethers.utils.formatEther(formData.price)}
              onChange={(e) => {
                if (e.target.value && !isNaN(e.target.value)) {
                  setFormData({
                    ...formData,
                    price: ethers.utils.formatUnits(
                      ethers.utils.parseEther(e.target.value),
                      "wei"
                    ),
                  });
                }
              }}
            />
            <br />
            <label className="simple-texts1">
              First line  : 
              <br />
            </label>
            <input
              type="text"
              onChange={(e) => {
                setFormData({ ...formData, firstLine: e.target.value });
              }}
              className="line-input"
              id="first-line"
            />
            <br />
            <label className="simple-texts">
              Second line : 
              <br />
            </label>
            <input
              type="text"
              onChange={(e) => {
                setFormData({ ...formData, secondLine: e.target.value });
              }}
              className="line-input"
              id="second-line"
            />
            <br />
            <label className="simple-texts">
              Third line  : 
              <br />
            </label>
            <input
              type="text"
              onChange={(e) => {
                setFormData({ ...formData, thirdLine: e.target.value });
              }}
              className="line-input"
              id="third-line"
            />
            <br />
          </form>
          <button
            onClick={askContractToUpdateNft}
            disabled={isUpdating}
            className="cta-button connect-wallet-button"
          >
            {isUpdating ? "Updating..." : "Update"}
          </button>
        </>
      );
    }
  };

  const askContractToUpdateNft = async () => {
    try {
      setIsUpdating(true);
      const { ethereum } = window;

      let provider = null;
      if (ethereum && walletType !== constants.WALLET_CONNECT) {
        provider = new ethers.providers.Web3Provider(ethereum);
      } else {
        if (!wProviderEnabled) {
          await wProvider.enable();
        } else {
          setWProviderEnabled(true);
        }
        provider = new ethers.providers.Web3Provider(wProvider);
      }
      const signer = provider.getSigner();
      const connectedContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        theBillboard.abi,
        signer
      );

      console.log("Going to pop wallet now to pay gas...");
      let nftTxn = await connectedContract.updateBillboard(
        formData && formData.firstLine ? formData.firstLine : "",
        formData && formData.secondLine ? formData.secondLine : "",
        formData && formData.thirdLine ? formData.thirdLine : "",
        { value: formData.price }
      );

      console.log("Mining...please wait.");
      await nftTxn.wait();
    } catch (error) {
      console.log(error);
      if (error.message) alert(error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  /*
   * Added a conditional render! We don't want to show Connect to Wallet if we're already conencted :).
   */
  return (
    <div className="App">
      <div className="container">
        <div className="header-container">
          <p className="header gradient-text"><img src="https://gateway.pinata.cloud/ipfs/QmTrR65EGWsrCJkHVC96uFtTsGxtLfi5xqCqmz2FffsY9F?preview=1" className="slav-logo" alt="slaverse"/>Cat Propaganda</p>
          <p className="sub-text">
           The Cat Propaganda by Slav Cat is the First Communist Activity going to happen 
           completely on-chain, bringing insane meme potential 
           from Eastern Europe to the rest of the world! Its an experiment
           for building the strongest Slavic ecosystem to ensure that all
            brothers can create and spread their "Power To All" ideologies which 
            can inspire World on {" "}
            <a href={OPENSEA_LINK} target="_blank" rel="noreferrer" className="main-links">
              OpenSea
            </a>
            .
          </p>
          <p className="sub-text">
            The Propaganda Poster is generated on-chain, so even if the
           capitalists try to kill our development, our ideologies will always survive ✨
          </p>
          <p className="subsub-text">
            To update The Propaganda Poster you need to pay more than the last paid
            price, so that best ideology gets featured. Each line has a limit of 50 bytes (50 standard characters).
            You can also do it on {" "}
            <a
              target="_blank"
              href={
                "https://rinkeby.etherscan.io/address/" +
                CONTRACT_ADDRESS +
                "#writeContract"
              }
              rel="noreferrer"
              className="main-links"
            >
              Etherscan
            </a>
            . Community Strong Together!🐱
          </p>
          {currentAccount === "" ? renderNotConnectedContainer() : renderForm()}
        </div>
        {isLoading ? <p>Loading...</p> : renderBillboard()}
        {renderPastBillboards()}
        <div className="footer-container">
          <img alt="Twitter Logo" className="twitter-logo" src={twitterLogo} />
          <a
            className="footer-text"
            href={TWITTER_LINK}
            target="_blank"
            rel="noreferrer"
          >{`Bring the Catnip Comrade! @${TWITTER_HANDLE}`}</a>
        </div>
      </div>
      <WalletModal
        metaClick={connectWallet}
        walletConnectClick={connectWithWalletConnect}
        show={show}
        handleClose={handleClose}
      />
    </div>
  );
};

export default App;
