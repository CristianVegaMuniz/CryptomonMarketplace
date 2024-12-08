import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { addresses, abis } from './contracts/src'; // Asegúrate de tener las direcciones y ABI correctos
import { checkWalletConnection, setupWalletListener } from './walletUtils';

const provider = new ethers.providers.Web3Provider(window.ethereum);
const NFTContract = new ethers.Contract(addresses.nft, abis.nft, provider);
const AuctionContract = new ethers.Contract(addresses.auctions, abis.auctions, provider);
const battleContract = new ethers.Contract(addresses.battle, abis.battle, provider);

const Explore = () => {
  const [nftsForSale, setNftsForSale] = useState([]);
  const [nftsInAuction, setNftsInAuction] = useState([]);
  const [metadata, setMetadata] = useState({});
  const [prices, setPrices] = useState({});
  const [highestBids, setHighestBids] = useState({});
  const [loading, setLoading] = useState(false);
  const [userAddress, setUserAddress] = useState(null);
  const [auctionEndTimes, setAuctionEndTimes] = useState({});
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [attributesCache, setAttributesCache] = useState({});

  useEffect(() => {
    nftsInAuction.forEach((tokenId) => {
      if (!attributesCache[tokenId]) {
        fetchAndCacheAttributes(tokenId);
      } 
    });
    nftsForSale.forEach((tokenId) => {
      if (!attributesCache[tokenId]) {
        fetchAndCacheAttributes(tokenId);
      }
    });
    checkWalletConnection(setUserAddress, provider); // Start the wallet check loop
    setupWalletListener(setUserAddress); // Listen for wallet events

    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000)); // Actualizar cada segundo
    }, 1000);

    
    const fetchNFTsForSaleAndAuction = async () => {
      try {
        const signer = provider.getSigner();
        const contractWithSigner_NFT = NFTContract.connect(signer);
        const contractWithSigner_Auctions = AuctionContract.connect(signer);

  
        // Obtener NFTs en venta
        const saleNFTs = await contractWithSigner_NFT.getNFTsOnSale();
        setNftsForSale(saleNFTs);
  
        // Obtener NFTs en subasta
        const auctionNFTs = await contractWithSigner_Auctions.getNFTsInAuction();
        setNftsInAuction(auctionNFTs);
  
        // Obtener metadatos
        const metadataObj = {};
        const fetchMetadata = async (nftList) => {
          for (let tokenId of nftList) {
            const tokenURI = await contractWithSigner_NFT.tokenURI(tokenId);
            const metadataResponse = await fetch(tokenURI.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/'));
            const metadataJSON = await metadataResponse.json();
            metadataObj[tokenId] = metadataJSON;
          }
        };
  
        await fetchMetadata([...saleNFTs, ...auctionNFTs]);
        setMetadata(metadataObj);
  
        // Obtener precios de venta
        const pricesObj = {};
        for (let tokenId of saleNFTs) {
          try {
            const priceInWei = await contractWithSigner_NFT.salePrices(tokenId);
            pricesObj[tokenId] = ethers.utils.formatEther(priceInWei);
          } catch (err) {
            console.error(`Error fetching price for tokenId ${tokenId}:`, err);
          }
        }
        setPrices(pricesObj);

        const endTimesObj = {};
        // Obtener pujas más altas
        const highestBidsObj = {};
        for (let tokenId of auctionNFTs) {
          try {
            const topBid = await contractWithSigner_Auctions.auctions(tokenId).then(res => res.topBid);
            highestBidsObj[tokenId] = ethers.utils.formatEther(topBid);
            const auctionCloseTime = await contractWithSigner_Auctions.auctions(tokenId);
            endTimesObj[tokenId] = auctionCloseTime.auctionCloseTime;
          } catch (err) {
            console.error(`Error fetching highest bid for tokenId ${tokenId}:`, err);
          }
        }
        setHighestBids(highestBidsObj);
        setAuctionEndTimes(endTimesObj);
  
      } catch (error) {
        console.error('Error fetching NFTs:', error);
      }
    };
  
    fetchNFTsForSaleAndAuction();

    return () => clearInterval(interval); // Limpiar intervalo al desmontar
  }, [nftsForSale, nftsInAuction, attributesCache]);
  
  const handleBuy = async (tokenId) => {
    setLoading(true);
    try {
      const signer = provider.getSigner();
      const contractWithSigner = NFTContract.connect(signer);
  
      // Obtener el precio del NFT directamente del contrato
      const priceInWei = await contractWithSigner.salePrices(tokenId);
      const priceInEther = ethers.utils.formatEther(priceInWei); // Convertimos a Ether para mostrar
  
      // Confirmar con el usuario
      const confirmPurchase = window.confirm(
        `The price for NFT with Token ID ${tokenId} is ${priceInEther} ETH. Do you want to proceed?`
      );
      if (!confirmPurchase) {
        setLoading(false);
        return;
      }
  
      // Llamar a la función buyNFT del contrato
      const tx = await contractWithSigner.buyNFT(tokenId, { value: priceInWei });
      await tx.wait(); // Esperar confirmación de la transacción
  
      alert(`Successfully purchased NFT with Token ID ${tokenId} for ${priceInEther} ETH!`);
    } catch (error) {
      console.error('Error buying NFT:', error);
      alert(`Failed to purchase NFT: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getNFTAttributes = async (tokenId) => {
    if (attributesCache[tokenId]) {
      return attributesCache[tokenId];
    }
    try {
      const attributes = await battleContract.getNFTAttributes(tokenId);
      const formattedAttributes = {
        strength: attributes.strength.toString(),
        agility: attributes.agility.toString(),
        intelligence: attributes.intelligence.toString(),
        experience: attributes.experience.toString(),
        level: attributes.level.toString(),
        availablePoints: attributes.availablePoints.toString(),
      };
      setAttributesCache((prev) => ({ ...prev, [tokenId]: formattedAttributes }));
      return formattedAttributes;
    } catch (err) {
      console.error(`Error getting attributes for tokenId ${tokenId}:`, err);
      return null;
    }
  };

  const fetchAndCacheAttributes = async (tokenId) => {
    const attributes = await getNFTAttributes(tokenId);
    if (attributes) {
      setAttributesCache((prev) => ({ ...prev, [tokenId]: attributes }));
    }
  };

  const handleBid = async (tokenId) => {
    setLoading(true);
    try {
      const signer = provider.getSigner();
      const contractWithSigner = AuctionContract.connect(signer);
  
      // Solicitar al usuario que introduzca el monto de la puja en ETH
      const bidAmount = prompt("Enter your bid amount in ETH:");
      if (!bidAmount || isNaN(bidAmount) || parseFloat(bidAmount) <= 0) {
        alert("Invalid bid amount!");
        setLoading(false);
        return;
      }
  
      // Convertir la cantidad a formato Wei para el contrato (internamente)
      const bidValueInEther = ethers.utils.parseEther(bidAmount);
  
      // Llamar a la función `bid` del contrato con el valor de la puja
      const tx = await contractWithSigner.bid(tokenId, { value: bidValueInEther });
      await tx.wait(); // Esperar confirmación de la transacción
  
      alert(`Bid placed successfully for Token ID ${tokenId} with ${bidAmount} ETH!`);
    } catch (error) {
      console.error("Error bidding on NFT:", error);
      alert(`Failed to place bid: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  const formatTime = (seconds) => {
    if (seconds <= 0) return 'Auction Ended';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}h ${minutes}m ${secs}s`;
  };

  return (
    <div>
      <h2>Explore NFTs</h2>

      {/* Mostrar NFTs en Subasta */}
      <h3>NFTs in Auction</h3>
      <div className="nft-grid">
        {nftsInAuction.length === 0 ? (
          <p>No NFTs in auction!</p>
        ) : (
          nftsInAuction.map((tokenId) => (
            <div key={tokenId.toString()} className="nft-card">
              <img
                src={metadata[tokenId]?.image?.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')}
                alt={metadata[tokenId]?.name || 'NFT Image'}
                width="200"
              />
              <p><strong>{metadata[tokenId]?.name || 'NFT Name'}</strong></p>
              <p>{metadata[tokenId]?.description || 'Description not available'}</p>
              {attributesCache[tokenId] ? (
                    <div className="attributes">
                      <p>Lvl: {attributesCache[tokenId].level}</p>
                      <p>Str: {attributesCache[tokenId].strength}</p>
                      <p>Agi: {attributesCache[tokenId].agility}</p>
                      <p>Int: {attributesCache[tokenId].intelligence}</p>
                    </div>
                      ) : (
                        <p>Cargando atributos...</p>
              )}
              <p><strong>Status:</strong> In Auction</p>
              <p><strong>Highest Bid:</strong> {highestBids[tokenId] ? `${highestBids[tokenId]} ETH` : 'No bids yet'}</p>
              <p>
                <strong>Time Left:</strong>{' '}
                {auctionEndTimes[tokenId] ? formatTime(auctionEndTimes[tokenId] - now) : 'Loading...'}
              </p>              <button onClick={() => handleBid(tokenId)} disabled={loading}>
                {loading ? 'Processing...' : 'Place Bid'}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Mostrar NFTs a la Venta */}
      <h3>NFTs for Sale</h3>
      <div className="nft-grid">
        {nftsForSale.length === 0 ? (
          <p>No NFTs for sale!</p>
        ) : (
          nftsForSale.map((tokenId) => (
            <div key={tokenId.toString()} className="nft-card">
              <img
                src={metadata[tokenId]?.image?.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')}
                alt={metadata[tokenId]?.name || 'NFT Image'}
                width="200"
              />
              <p><strong>{metadata[tokenId]?.name || 'NFT Name'}</strong></p>
              <p>{metadata[tokenId]?.description || 'Description not available'}</p>
              {attributesCache[tokenId] ? (
                    <div className="attributes">
                      <p>Lvl: {attributesCache[tokenId].level}</p>
                      <p>Str: {attributesCache[tokenId].strength}</p>
                      <p>Agi: {attributesCache[tokenId].agility}</p>
                      <p>Int: {attributesCache[tokenId].intelligence}</p>
                    </div>
                      ) : (
                        <p>Cargando atributos...</p>
                      )}
              <p><strong>Price:</strong> {prices[tokenId] ? `${prices[tokenId]} ETH` : 'Loading...'}</p>
              <button onClick={() => handleBuy(tokenId)} disabled={loading}>
                {loading ? 'Processing...' : 'Buy NFT'}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Explore;
