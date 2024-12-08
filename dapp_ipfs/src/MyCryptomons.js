import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { addresses, abis } from './contracts/src';
import Swal from 'sweetalert2';
import loadingGif from './loading.gif'; // Adjust the path accordingly

const provider = new ethers.providers.Web3Provider(window.ethereum);
const NFTContract = new ethers.Contract(addresses.nft, abis.nft, provider);
const AuctionContract = new ethers.Contract(addresses.auctions, abis.auctions, provider);
const battleContract = new ethers.Contract(addresses.battle, abis.battle, provider);

const MyCryptomons = () => {
  const [myNFTs, setMyNFTs] = useState([]);
  const [selectedNFT, setSelectedNFT] = useState(null); // NFT seleccionado
  const [isModalOpen, setIsModalOpen] = useState(false); // Controla el modal
  const [loading, setLoading] = useState(false); // Indica si está cargando
  const [attributesCache, setAttributesCache] = useState({});
  const [pointsAllocation, setPointsAllocation] = useState({ strength: 0, agility: 0, intelligence: 0 });

    // Función para alertas estilizadas
  const showAlert = (title, text, icon = 'info') => {
    Swal.fire({
      title,
      text,
      icon,
      confirmButtonText: 'OK',
    });
  };

  useEffect(() => {

    const fetchNFTs = async () => {
      try {
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        console.log(userAddress)
        const tokenIds = await NFTContract.getNFTsByOwner(userAddress);
        console.log(tokenIds)
        const nftData = await Promise.all(
          tokenIds.map(async (tokenId) => {
            const tokenURI = await NFTContract.tokenURI(tokenId);
            const response = await fetch(tokenURI.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/'));
            const metadata = await response.json();
            const attributes = await getNFTAttributes(tokenId); // Carga los atributos aquí

            // Comprobamos si está a la venta o en subasta
            const salePrice = await NFTContract.salePrices(tokenId);
            const auction = await AuctionContract.auctions(tokenId);

            const isOnSale = salePrice > 0;
            const isInAuction = auction.owner == userAddress && auction.ended == false;
            const isAuctionOver = auction.auctionCloseTime <= Math.floor(Date.now() / 1000);
            return { tokenId, ...metadata, isOnSale, isInAuction, isAuctionOver, attributes }
          })
        );
        setMyNFTs(nftData);

      } catch (error) {
        console.error('Error fetching NFTs:', error);
      }
    };

    fetchNFTs();
    }, []);

  const handlePointsChange = (attr, value) => {
    const intValue = parseInt(value, 10) || 0;
    setPointsAllocation((prev) => ({ ...prev, [attr]: intValue }));
  };

  const handleAllocatePoints = async () => {
    if (!selectedNFT) return;

    const { strength, agility, intelligence } = pointsAllocation;
    const totalPoints = strength + agility + intelligence;

    if (totalPoints > parseInt(selectedNFT.attributes.availablePoints)) {
      showAlert("Error", "You have exceeded the available points!", "error");
      return;
    }
    setLoading(true);
    try {
      const signer = provider.getSigner();
      const contractWithSigner = battleContract.connect(signer);

      await contractWithSigner.allocatePoints(
        selectedNFT.tokenId,
        strength,
        agility,
        intelligence
      );

      showAlert("Success", "Points allocated successfully!", "success");

      const updatedAttributes = await getNFTAttributes(selectedNFT.tokenId);
      setSelectedNFT((prev) => ({
        ...prev,
        attributes: updatedAttributes,
      }));
    } catch (err) {
      console.error("Error allocating points:", err);
      showAlert("Error", "Failed to allocate points. Please try again.", "error");
    } finally {
      setLoading(false);
      setPointsAllocation({ strength: 0, agility: 0, intelligence: 0 });
    }
  };

  const handleCardClick = async (nft) => {
    setSelectedNFT(nft);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedNFT(null);
  };

  const handleAction = async (action, priceOrTime) => {
    if (!selectedNFT) return;
    setLoading(true);

    try {
      const signer = provider.getSigner();
      const contractWithSigner_NFT = NFTContract.connect(signer);
      const contractWithSigner_Auctions = AuctionContract.connect(signer);

      if (action === 'sell') {

        await contractWithSigner_NFT.putOnSale(selectedNFT.tokenId, ethers.utils.parseEther(priceOrTime.toString()));
      } else if (action === 'auction') {

        await contractWithSigner_Auctions.createAuction(selectedNFT.tokenId, priceOrTime);
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error performing action:', error);
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

  const handleCancelSaleOrAuction = async () => {
    if (!selectedNFT) return;
    setLoading(true);

    try {
      const signer = provider.getSigner();
      const userAddress = await signer.getAddress();
      const contractWithSigner_NFT = NFTContract.connect(signer);
      const contractWithSigner_Auctions = AuctionContract.connect(signer);

      const auction = await AuctionContract.auctions(selectedNFT.tokenId);
      const salePrice = await NFTContract.salePrices(selectedNFT.tokenId);

      if (auction.owner == userAddress && auction.ended == false) {
        if (auction.owner !== await signer.getAddress()) {
          showAlert('Error', 'You are not the owner of this auction!', 'error');
          return;
        }

        await contractWithSigner_Auctions.endAuction(selectedNFT.tokenId);
        showAlert('Success', 'Auction cancelled!', 'success');
      } else if (salePrice > 0) {
        await contractWithSigner_NFT.cancelSale(selectedNFT.tokenId);
        showAlert('Success', 'Sale cancelled!', 'success');
      } else {
        showAlert('Notice', 'This NFT is neither for sale nor in an active auction.', 'info');
      }

      handleCloseModal();
    } catch (error) {
      console.error('Error cancelling sale or auction:', error);
      showAlert('Error', 'Failed to cancel sale or auction. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
 
          <div>
            <h2>My Cryptomons</h2>
            <div className="nft-grid">
              {myNFTs.length === 0 ? (
                <p>No Cryptomons found. Start by minting one!</p>
              ) : (
                myNFTs.map((nft, index) => (
                  <div className="nft-card" onClick={() => handleCardClick(nft)}>
                    <img
                      src={nft.image.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')}
                      alt={nft.name}
                    />
                    <p>
                      <strong>Title:</strong> {nft.name}
                    </p>
                    <p>
                      <strong>Description:</strong> {nft.description}
                    </p>
                    {nft.attributes ? (
                    <div className="attributes">
                      <p>Lvl: {nft.attributes.level}</p>
                      <p>Exp: {nft.attributes.experience}</p>
                      <p>Str: {nft.attributes.strength}</p>
                      <p>Agi: {nft.attributes.agility}</p>
                      <p>Int: {nft.attributes.intelligence}</p>
                    </div>
                      ) : (
                        <p>Cargando atributos...</p>
                      )}
                  </div>
                ))
              )}
            </div>
  
            {isModalOpen && selectedNFT && (
              <div className="modal">
                <div className="modal-content">
                {parseInt(selectedNFT.attributes.availablePoints) > 0 && (
                  <div>
                    <p>Available Points: {selectedNFT.attributes.availablePoints}</p>
                    <label>
                      Strength:
                      <input
                        type="number"
                        value={pointsAllocation.strength}
                        onChange={(e) => handlePointsChange("strength", e.target.value)}
                      />
                    </label>
                    <label>
                      Agility:
                      <input
                        type="number"
                        value={pointsAllocation.agility}
                        onChange={(e) => handlePointsChange("agility", e.target.value)}
                      />
                    </label>
                    <label>
                      Intelligence:
                      <input
                        type="number"
                        value={pointsAllocation.intelligence}
                        onChange={(e) => handlePointsChange("intelligence", e.target.value)}
                      />
                    </label>
                    <button onClick={handleAllocatePoints} disabled={loading}>
                      {loading ? "Processing..." : "Allocate Points"}
                    </button>
                  </div>
                  )}
                  <h3>{selectedNFT.name}</h3>
                  <p>{selectedNFT.description}</p>
                  <p>
                    <strong>Status:</strong>{' '}
                    {selectedNFT.isOnSale
                      ? 'For Sale'
                      : selectedNFT.isInAuction
                      ? 'In Auction'
                      : 'Not Listed'}
                    <p>
                    {selectedNFT.isInAuction && selectedNFT.isAuctionOver
                        ? "Auction Over"
                        : ''}
                    </p>
                  </p>

                  <div>
                    <input
                      type="number"
                      placeholder={
                        selectedNFT.isInAuction
                          ? 'Auction Time (seconds)'
                          : 'Sale Price (ETH) or Auction Time (seconds)'
                      }
                      onChange={(e) =>
                        setSelectedNFT({
                          ...selectedNFT,
                          actionValue: e.target.value,
                        })
                      }
                    />
                  </div>
  
                  {selectedNFT.isOnSale || selectedNFT.isInAuction ? (
                    <button
                      onClick={handleCancelSaleOrAuction}
                      disabled={loading}
                    >
                      {loading ? 'Processing...' : 'Cancel Sale/Auction'}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() =>
                          handleAction('sell', selectedNFT.actionValue)
                        }
                        disabled={loading}
                      >
                        {loading ? 'Processing...' : 'Put for Sale'}
                      </button>
                      <button
                        onClick={() =>
                          handleAction('auction', selectedNFT.actionValue)
                        }
                        disabled={loading}
                      >
                        {loading ? 'Processing...' : 'Start Auction'}
                      </button>
                    </>
                  )}
  
                  <button onClick={handleCloseModal} disabled={loading}>
                    Close
                  </button>
                </div>
              </div>
            )}
            {loading && (
              <div className="loading-overlay">
                <div className="loading-content">
                  <img src={loadingGif} alt="Loading..." />
                  <p>Processing transaction...</p>
                </div>
              </div>
            )}
          </div>
    </div>
  );
  
  
};

export default MyCryptomons;