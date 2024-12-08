import React, { useEffect, useState } from 'react';
import { ethers } from 'ethers';
import { addresses, abis } from './contracts';
import Modal from 'react-modal';
import './BattleArena.css'; // Importar archivo CSS

function BattleArena() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();

  const nftContract = new ethers.Contract(addresses.nft, abis.nft, signer);
  const battleContract = new ethers.Contract(addresses.battle, abis.battle, signer);

  const [activeTab, setActiveTab] = useState('requests');
  const [myNFTs, setMyNFTs] = useState([]);
  const [opponentNFTs, setOpponentNFTs] = useState([]);
  const [attributesCache, setAttributesCache] = useState({});
  const [selectedOpponent, setSelectedOpponent] = useState(null);
  const [selectedNFT, setSelectedNFT] = useState(null);
  const [betAmount, setBetAmount] = useState('');
  const [isModalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [battleRequests, setBattleRequests] = useState([]);  // Add this at the top with your other state variables

  const loadMyNFTs = async () => {
    try {
      const myAddress = await signer.getAddress();
      const nftIds = await nftContract.getNFTsByOwner(myAddress);
      const nftData = await Promise.all(
        nftIds.map(async (id) => {
          const uri = await nftContract.tokenURI(id);
          const response = await fetch(uri.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/'));
          const metadata = await response.json();
          const imageUrl = metadata.image.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/');
          const attributes = await getNFTAttributes(id); // Carga los atributos aquí
          return { id: id.toString(), ...metadata, image: imageUrl, attributes };
        })
      );
      setMyNFTs(nftData);
    } catch (err) {
      console.error('Error loading NFTs:', err);
    }
  };

  const loadOpponentNFTs = async () => {
    try {
      const totalNFTs = await nftContract.getAllNFTs();
      const opponentData = await Promise.all(
        Array.from({ length: totalNFTs }, async (_, i) => {
          const uri = await nftContract.tokenURI(i + 1);
          const response = await fetch(uri.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/'));
          const metadata = await response.json();
          const imageUrl = metadata.image.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/');
          return { id: (i + 1).toString(), ...metadata, image: imageUrl };
        })
      );

      // Cargar atributos automáticamente
      const opponentWithAttributes = await Promise.all(
        opponentData.map(async (nft) => {
          const attributes = await getNFTAttributes(nft.id);
          return { ...nft, attributes };
        })
      );

      setOpponentNFTs(opponentWithAttributes);
    } catch (err) {
      console.error('Error loading opponent NFTs:', err);
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

  const loadBattleRequests = async () => {
    try {
      const userAddress = await signer.getAddress();
      const battles = await battleContract.getBattlesByUser(userAddress);
  
      // Usamos un Set para evitar duplicados de batalla
      const uniqueBattlesSet = new Set();
      const formattedBattles = await Promise.all(
        battles.map(async (battleId) => {
          const battle = await battleContract.battles(battleId);
  
          // Si el retador y el oponente son la misma persona, no lo añadimos
          if (battle.challenger.toLowerCase() === battle.opponent.toLowerCase()) {
            // Aquí verificamos si ya tenemos una batalla similar, si ya existe, la omitimos
            if (uniqueBattlesSet.has(battleId.toString())) {
              return null; // Esto omite la batalla duplicada
            } else {
              uniqueBattlesSet.add(battleId.toString()); // Añadimos la batalla al set
            }
          }
  
          const challengerNFTUri = await nftContract.tokenURI(battle.challengerNFT);
          const opponentNFTUri = await nftContract.tokenURI(battle.opponentNFT);
  
          const challengerMetadata = await fetch(
            challengerNFTUri.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')
          ).then((res) => res.json());
  
          const opponentMetadata = await fetch(
            opponentNFTUri.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')
          ).then((res) => res.json());
  
          const challengerImage = challengerMetadata.image.startsWith('ipfs://')
            ? challengerMetadata.image.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')
            : challengerMetadata.image;
  
          const opponentImage = opponentMetadata.image.startsWith('ipfs://')
            ? opponentMetadata.image.replace('ipfs://', 'http://0.0.0.0:8082/ipfs/')
            : opponentMetadata.image;
  
          return {
            battleId: battleId.toString(),
            challenger: battle.challenger,
            opponent: battle.opponent,
            challengerNFT: battle.challengerNFT,
            opponentNFT: battle.opponentNFT,
            betAmount: ethers.utils.formatEther(battle.betAmount),
            accepted: battle.accepted,
            completed: battle.completed,
            winner: battle.winner,
            challengerName: challengerMetadata.name,
            opponentName: opponentMetadata.name,
            challengerImage,
            opponentImage,
            challengerAttributes: await getNFTAttributes(battle.challengerNFT),
            opponentAttributes: await getNFTAttributes(battle.opponentNFT),
          };
        })
      );
  
      // Filtrar los valores nulos (batallas duplicadas o erróneas)
      setBattleRequests(formattedBattles.filter(Boolean));
    } catch (err) {
      console.error('Error loading battle requests:', err);
    }
  };
  
  const acceptBattleRequest = async (battleId) => {
    try {
      // Fetch the battle details using battleId
      const battle = await battleContract.battles(battleId);
  
      // Now you can access battle.betAmount and other battle details
      const betAmount = ethers.utils.formatEther(battle.betAmount);  // Ensure it's in Ether format
  
      // Accept the battle
      const tx = await battleContract.acceptBattle(battleId, { value: ethers.utils.parseEther(betAmount.toString()) });
      await tx.wait();
  
      alert('Batalla aceptada');
      setRefreshKey((key) => key + 1);  // Recargar solicitudes de batalla
    } catch (err) {
      console.error('Error accepting battle request:', err);
      alert('No se pudo aceptar la batalla');
    }
  };
  
  const rejectBattleRequest = async (battleId) => {
    try {
      const tx = await battleContract.cancelBattle(battleId);
      await tx.wait();
      alert('Batalla rechazada');
      setRefreshKey((key) => key + 1);  // Recargar solicitudes de batalla
    } catch (err) {
      console.error('Error rejecting battle request:', err);
      alert('No se pudo rechazar la batalla');
    }
  };
  
  const createBattle = async () => {
    try {
      if (!selectedNFT || !betAmount) {
        alert('Selecciona tu NFT y especifica una cantidad de apuesta.');
        return;
      }
      const tx = await battleContract.createBattle(selectedNFT, selectedOpponent.id, {
        value: ethers.utils.parseEther(betAmount),
      });
      await tx.wait();
      alert('¡Desafío enviado!');
      setRefreshKey((key) => key + 1);
      closeModal();
    } catch (err) {
      console.error('Error creating battle:', err);
      alert('No se pudo crear la batalla.');
    }
  };

  useEffect(() => {
    loadMyNFTs();
    loadOpponentNFTs();
    loadBattleRequests();
  }, [refreshKey]);

  const openModal = (opponent) => {
    setSelectedOpponent(opponent);
    setModalOpen(true);
  };

  const closeModal = () => {
    setSelectedOpponent(null);
    setSelectedNFT(null);
    setBetAmount('');
    setModalOpen(false);
  };

  return (
    <div className="battle-arena">
      <h2>Battle Arena</h2>
      <nav className="tabs">
        <button
          className={`tab-button ${activeTab === 'requests' ? 'active' : ''}`}
          onClick={() => setActiveTab('requests')}
        >
          Fight requests
        </button>
        <button
          className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search opponent
        </button>
      </nav>


      {activeTab === 'requests' && (
        <div>
          <div className="request-grid">
            {battleRequests.length > 0 ? (
              battleRequests.map((battle) => (
                <div key={battle.battleId} className="request-card">
                  <div className="nft-battle">
                    <div className="nft-details">
                    <img
            className="nft-image"
            src={battle.challengerImage || '/placeholder.png'}
            alt={battle.challengerName}
            onError={(e) => (e.target.src = '/placeholder.png')}
          />                      <p>{battle.challengerName}</p>
                      <div className="attributes">
                        <p>Lvl: {battle.challengerAttributes.level}</p>
                        <p>Str: {battle.challengerAttributes.strength}</p>
                        <p>Agi: {battle.challengerAttributes.agility}</p>
                        <p>Int: {battle.challengerAttributes.intelligence}</p>
                      </div>
                    </div>
                    <div className="vs-icon">VS</div>
                    <div className="nft-details">
                      <img className="nft-image" src={battle.opponentImage} alt={battle.opponentName} />
                      <p>{battle.opponentName}</p>
                      <div className="attributes">
                        <p>Lvl: {battle.opponentAttributes.level}</p>
                        <p>Str: {battle.opponentAttributes.strength}</p>
                        <p>Agi: {battle.opponentAttributes.agility}</p>
                        <p>Int: {battle.opponentAttributes.intelligence}</p>
                      </div>
                    </div>
                  </div>
                  <p>Apuesta: {battle.betAmount} ETH</p>
                  <div className="actions">
                    {!battle.accepted && !battle.completed && (
                      <>
                        <button onClick={() => acceptBattleRequest(battle.battleId)}>Aceptar</button>
                        <button onClick={() => rejectBattleRequest(battle.battleId)}>Rechazar</button>
                      </>
                    )}
                    {battle.completed && (
                      <p>
                        Batalla completada.{' '}
                        {battle.winner === battle.challenger
                          ? 'Ganador: ' + battle.challengerName
                          : 'Ganador: ' + battle.opponentName}
                      </p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p>No tienes solicitudes de batalla pendientes.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'search' && (
        <div>
          <div className="nft-grid">
            {opponentNFTs.map((nft) => (
              <div key={nft.id} className="nft-card">
                <img src={nft.image} alt={nft.name} />
                <h4>{nft.name}</h4>
                <div className="attributes">
                  {nft.attributes ? (
                    <>
                      <p>Lvl: {nft.attributes.level}</p>
                      <p>Str: {nft.attributes.strength}</p>
                      <p>Agi: {nft.attributes.agility}</p>
                      <p>Int: {nft.attributes.intelligence}</p>
                    </>
                  ) : (
                    <p>Cargando atributos...</p>
                  )}
                </div>
                <button onClick={() => openModal(nft)}>Desafiar</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Modal
        isOpen={isModalOpen}
        onRequestClose={closeModal}
        className="battle-modal"
      >
        <h2>Who will fight {selectedOpponent?.name}?</h2>
        <div className="nft-container">
          <div className="nft-grid">
            {myNFTs
              .filter((nft) => nft.id !== selectedOpponent?.id) // Excluye el NFT seleccionado como oponente
              .map((nft) => (
                <div
                  key={nft.id}
                  className={`nft-card ${selectedNFT === nft.id ? 'selected' : ''}`}
                  onClick={() => setSelectedNFT(nft.id)}
                >
                  <img src={nft.image} alt={nft.name} />
                  <p>{nft.name}</p>
                  <div className="attributes">
                    {nft.attributes ? (
                      <>
                        <p>Lvl: {nft.attributes.level ?? 'N/A'}</p>
                        <p>Str: {nft.attributes.strength ?? 'N/A'}</p>
                        <p>Agi: {nft.attributes.agility ?? 'N/A'}</p>
                        <p>Int: {nft.attributes.intelligence ?? 'N/A'}</p>
                      </>
                    ) : (
                      <p>Attributes not available</p>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
        <input
          type="number"
          placeholder="Cantidad en ETH"
          value={betAmount}
          onChange={(e) => setBetAmount(e.target.value)}
        />
        <div className="actions">
          <button onClick={createBattle}>Confirmar Desafío</button>
          <button className="cancel" onClick={closeModal}>Cancelar</button>
        </div>
      </Modal>
    </div>
  );
}

export default BattleArena;
