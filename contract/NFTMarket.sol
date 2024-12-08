// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./BattleArena.sol";
import "./Auctions.sol";

contract DecentralisedNFTMarket is IERC721Receiver, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    string private _baseURIExtended;
    uint256 public mintingFee = 0 ether;

    address public battleArenaAddress;
    BattleArena public battleArena;

    address public auctionsAddress;
    Auctions public auctions;

    mapping(address => uint256[]) private _ownerTokens;

    event NFTMinted(address indexed owner, uint256 tokenId);

    constructor(address initialOwner) ERC721("DecentralisedNFTMarket", "DNFTM") Ownable(initialOwner) {
        _setBaseURI("ipfs://");
        battleArena = new BattleArena(address(this));
        battleArenaAddress = address(battleArena);
        auctions = new Auctions(address(this));
        auctionsAddress = address(auctions);
    }

    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata data
    ) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function _setBaseURI(string memory baseURI) private {
        _baseURIExtended = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    function setMintingFee(uint256 fee) external onlyOwner {
        mintingFee = fee;
    }

    function mintCollectionNFT(string memory metadataURI) public payable {
        require(msg.value >= mintingFee, "Insufficient ETH sent for minting");

        _tokenIds.increment();
        uint256 tokenId = _tokenIds.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Generate random attributes
        uint256 maxStatCap = 30; // Total stats for level 0
        uint256 strength = randomAttribute(maxStatCap / 2, tokenId) % (maxStatCap / 2);
        uint256 agility = randomAttribute(maxStatCap - strength, tokenId + 1) % (maxStatCap - strength);
        uint256 intelligence = maxStatCap - strength - agility;

        battleArena.setNFTAttributes(tokenId, strength, agility, intelligence);

        payable(owner()).transfer(msg.value);

        _ownerTokens[msg.sender].push(tokenId);
        emit NFTMinted(msg.sender, tokenId);
    }

    function getNFTsByOwner(address owner) public view returns (uint256[] memory) {
        return _ownerTokens[owner];
    }

    function getAllNFTs() public view returns (uint256) {
        return _tokenIds.current();
    }

    function randomAttribute(uint256 max, uint256 seed) internal view returns (uint256) {
        return uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, seed))) % max;
    }

    function removeTokenFromOwner(address owner, uint256 tokenId) external {
        require(msg.sender == auctionsAddress, "Only the Auctions contract can call this function");
        uint256[] storage tokens = _ownerTokens[owner];
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i] == tokenId) {
                tokens[i] = tokens[tokens.length - 1];
                tokens.pop();
                break;
            }
        }
    }  

    function addTokenToOwner(address owner, uint256 tokenId) external {
        require(msg.sender == auctionsAddress, "Only the Auctions contract can call this function");
        _ownerTokens[owner].push(tokenId);
    }

    /**************************************************       SALES       **************************************************************************/

    mapping(uint256 => uint256) public salePrices;

    event NFTOnSale(uint256 indexed tokenId, uint256 price, address owner);
    event NFTSold(uint256 indexed tokenId, uint256 price, address buyer);
    event SaleCancelled(uint256 indexed tokenId, address owner);

    function putOnSale(uint256 _tokenId, uint256 _price) external {
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can put the NFT on sale");
        approve(address(this), _tokenId);
        salePrices[_tokenId] = _price;

        emit NFTOnSale(_tokenId, _price, msg.sender);
    }

    function buyNFT(uint256 _tokenId) external payable {
        uint256 price = salePrices[_tokenId];
        require(price > 0, "The NFT is not for sale");
        require(msg.value >= price, "Insufficient funds to buy the NFT");

        require(getApproved(_tokenId) == address(this), "Contract is not approved to transfer this NFT");
        address previousOwner = ownerOf(_tokenId);
        _transfer(previousOwner, msg.sender, _tokenId);
        delete _ownerTokens[previousOwner];
        salePrices[_tokenId] = 0;
        _ownerTokens[msg.sender].push(_tokenId);

        payable(previousOwner).transfer(msg.value);
        emit NFTSold(_tokenId, price, msg.sender);
    }

    function cancelSale(uint256 _tokenId) external {
        require(salePrices[_tokenId] > 0, "The NFT is not for sale");
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can cancel the sale");
        salePrices[_tokenId] = 0;

        emit SaleCancelled(_tokenId, msg.sender);
    }

    function getNFTsOnSale() public view returns (uint256[] memory) {
        uint256[] memory onSaleNFTs = new uint256[](_tokenIds.current());
        uint256 count = 0;

        for (uint256 i = 1; i <= _tokenIds.current(); i++) {
            if (salePrices[i] > 0) { // Si el precio es mayor que 0, está en venta
                onSaleNFTs[count] = i;
                count++;
            }
        }

        // Ajustar el tamaño del array a los elementos encontrados
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = onSaleNFTs[i];
        }
        return result;
    }

    function setSalePrice(uint256 tokenId, uint256 price) external {
        require(msg.sender == auctionsAddress, "Only the Auctions contract can call this function");
        salePrices[tokenId] = price;
    }

}