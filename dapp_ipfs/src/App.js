import React, { useState, useEffect } from 'react';
import './App.css';
import logo from './logo.png'; // Asegúrate de añadir tu logo aquí.
import { create } from 'kubo-rpc-client'; // Cliente de IPFS
import { Buffer } from 'buffer';
import { ethers } from 'ethers'; // Interacción con Ethereum
import { addresses, abis } from './contracts'; // Direcciones y ABI del contrato
import MyCryptomons from './MyCryptomons'; // Asegúrate de importar el nuevo componente
import Explore from "./Explore";
import BattleArena from "./BattleArena";
import Swal from 'sweetalert2';

const provider = new ethers.providers.Web3Provider(window.ethereum);
const ipfsContract = new ethers.Contract(addresses.nft, abis.nft, provider);

function App() {
  const [activeTab, setActiveTab] = useState('explore');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ipfsHash, setIpfsHash] = useState('');

  // Función para alertas estilizadas
  const showAlert = (title, text, icon = 'info') => {
    Swal.fire({
      title,
      text,
      icon,
      confirmButtonText: 'OK',
    });
  };

  const generateImage = async (query) => {
    try {
      const response = await fetch(`http://localhost:8085/api/v1/sprite?q=${query}`, {
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch sprite');
      }
      const imageBlob = await response.blob();
      return imageBlob; // Devuelve la imagen generada como Blob
    } catch (err) {
      console.error(err);
      showAlert("Error", 'Error generating image: ' + err.message, "error");
    }
  };
  
  // Subir el archivo a IPFS
  const uploadToIPFS = async (fileBuffer) => {
    const client = await create('/ip4/0.0.0.0/tcp/5001'); // IPFS local
    const result = await client.add(fileBuffer);
    await client.files.cp(`/ipfs/${result.cid}`, `/${result.cid}`); // Copiar al nodo local
    return result.cid.toString(); // Devolver el CID del archivo
  };

  // Guardar el hash de IPFS en Ethereum
  const saveToBlockchain = async (metadataURI) => {
    const signer = provider.getSigner();
    const ipfsWithSigner = ipfsContract.connect(signer);
  
    // Obtener la dirección del usuario conectado
    const userAddress = await signer.getAddress();
  
    // Determinar la fee para el minting (consulta tu contrato para el valor exacto)
    const mintingFee = ethers.utils.parseEther("0.000000"); // Ejemplo: 0.01 ETH
    //const mintingFee = ipfsWithSigner.mintingFee

    // Llamar a mintCollectionNFT enviando la fee
    const tx = await ipfsWithSigner.mintCollectionNFT(metadataURI, { value: mintingFee });
    await tx.wait();

    console.log(`NFT minted successfully by ${userAddress} with fee: ${mintingFee.toString()} ETH`);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !description) {
      showAlert("Warning", 'Please provide a title and description for the Cryptomon.', "warning");
      
      return;
    }
  
    let imageCID, metadataCID;
  
    try {
      // Obtener la dirección del usuario conectado
      const signer = provider.getSigner();
      const ownerAddress = await signer.getAddress();

      // Paso 1: Generar la imagen desde el texto
      const imageBlob = await generateImage(title);
      if (!imageBlob) return;

      // Paso 2: Subir la imagen a IPFS
      imageCID = await uploadToIPFS(imageBlob);
      console.log('Uploaded image to IPFS with CID:', imageCID);

      // Paso 3: Crear y subir metadata JSON a IPFS
      const metadata = {
        name: title,
        description: description,
        owner: ownerAddress, // Asociar la dirección como propietario
        image: `ipfs://${imageCID}`,
      };
      metadataCID = await uploadToIPFS(Buffer.from(JSON.stringify(metadata)));
      console.log('Uploaded metadata to IPFS with CID:', metadataCID);

      // Paso 4: Guardar el metadata CID en la blockchain
      await saveToBlockchain(metadataCID);
      console.log('Saved Cryptomon metadata to Ethereum:', metadataCID);

  
      // Actualizar el estado
      setIpfsHash(metadataCID);
      showAlert("Success", 'Cryptomon created successfully! Metadata CID: ' + metadataCID, "success");

    } catch (error) {  
      // Intentar limpiar recursos en caso de error
      try {
        const client = await create('/ip4/0.0.0.0/tcp/5001');
        if (metadataCID) {
          await client.files.rm(`/${metadataCID}`);
          console.log('Deleted metadata from IPFS:', metadataCID);
        }
        if (imageCID) {
          await client.files.rm(`/${imageCID}`);
          console.log('Deleted image from IPFS:', imageCID);
        }
      } catch (cleanupError) {
        console.error('Error cleaning up IPFS files:', cleanupError);
      }
      showAlert("Error", 'Error occurred during Cryptomon creation. Resources cleaned up where possible. Error: ' + error, "error");

    }
  };
  


  // Renderiza el contenido según la pestaña activa
  const renderContent = () => {
    switch (activeTab) {
      case 'explore':
        return <Explore />;
      case 'create':
        return (
          <div className="create-nft-form">
            <h2>Create Your Cryptomon</h2>
            <form onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Cryptomon Name"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                placeholder="Cryptomon Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              <button type="submit">Mint Cryptomon</button>
            </form>
            {ipfsHash && (
              <p>
                Metadata uploaded to IPFS: 
                <a href={`http://0.0.0.0:5001/ipfs/${ipfsHash}`} target="_blank" rel="noopener noreferrer">
                  {ipfsHash}
                </a>
              </p>
            )}
          </div>
        );
      case 'my-nfts':
        return <MyCryptomons />; 
        case 'battle':
          return <BattleArena />; 
      default:
        return <div>Select a section from the navigation above.</div>;
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <div className="title-and-buttons">
          <img src={logo} alt="Logo" className="logo" />
          <h1>Cryptomon Marketplace</h1>
          <p>Explore, create, and collect Cryptomons</p>

          {/* Barra de navegación */}
          <nav>
            <a onClick={() => setActiveTab('explore')} className={activeTab === 'explore' ? 'active' : ''}>
              Explore
            </a>
            <a onClick={() => setActiveTab('create')} className={activeTab === 'create' ? 'active' : ''}>
              Create Cryptomon
            </a>
            <a onClick={() => setActiveTab('my-nfts')} className={activeTab === 'my-nfts' ? 'active' : ''}>
              My Cryptomons
            </a>
            <a onClick={() => setActiveTab('battle')} className={activeTab === 'battle' ? 'active' : ''}>
              Battle Arena
            </a>
          </nav>
        </div>
      </header>

      <main>
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
