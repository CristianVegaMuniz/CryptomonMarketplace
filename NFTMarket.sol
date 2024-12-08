// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract DecentralisedNFTMarket is IERC721Receiver, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    string private _baseURIExtended;
    uint256 public mintingFee = 0.000001 ether; // Tarifa de minteo

    struct Auction {
        uint256 tokenId;
        address payable owner;
        uint256 auctionCloseTime;
        uint256 topBid;
        address payable topBidder;
        bool ended;
        mapping(address => uint256) bids;
    }

    struct BlindAuction {
        address owner;
        uint256 tokenId;
        uint256 biddingEndTime;
        uint256 revealEndTime;
        bool auctionEnded;
        address highestBidder;
        uint256 highestBid;
        mapping(address => Bid) bids;
    }

    struct Bid {
        bytes32 hashedBid;
    }

    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => BlindAuction) public blindAuctions;
    mapping(uint256 => uint256) public salePrices; // Prices for NFTs on sale
    mapping(address => uint256[]) private _ownerTokens;

    event NFTMinted(address indexed owner, uint256 tokenId);
    event AuctionCreated(uint256 indexed tokenId, uint256 auctionCloseTime);
    event BidPlaced(uint256 indexed tokenId, address bidder, uint256 amount);
    event AuctionEnded(uint256 indexed tokenId, address winner, uint256 amount);
    event NFTOnSale(uint256 indexed tokenId, uint256 price, address owner);
    event NFTSold(uint256 indexed tokenId, uint256 price, address buyer);
    event SaleCancelled(uint256 indexed tokenId, address owner);
    event BlindAuctionCreated(uint256 indexed tokenId, uint256 biddingEndTime, uint256 revealEndTime);
    event BlindBidPlaced(address indexed bidder, bytes32 hashedBid);
    event BlindAuctionEnded(address winner, uint256 highestBid);
    event NFTPaid(address winner, uint256 amount);
    event FundsWithdrawn(address owner, uint256 amount);

    constructor(address initialOwner) ERC721("DecentralisedNFTMarket", "DNFTM") Ownable(initialOwner) {
        _setBaseURI("ipfs://");
    }

    function onERC721Received(
            address operator,
            address from,
            uint256 tokenId,
            bytes calldata data
        ) external override pure returns (bytes4) {
            return this.onERC721Received.selector;
    }

    function _setBaseURI(string memory baseURI) private {
        _baseURIExtended = baseURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseURIExtended;
    }

    // Cambiar la tarifa de minteo
    function setMintingFee(uint256 fee) external onlyOwner {
        mintingFee = fee;
    }

    // Mintear un nuevo NFT
    function mintCollectionNFT(string memory metadataURI) public payable {
        require(msg.value >= mintingFee, "Insufficient ETH sent for minting");

        _tokenIds.increment();
        uint256 tokenId = _tokenIds.current();
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, metadataURI);

        // Transferir fondos al propietario del contrato
        payable(owner()).transfer(msg.value);

        // Update mapping for owner to token IDs
        _ownerTokens[msg.sender].push(tokenId);
        emit NFTMinted(msg.sender, tokenId);
    }

    function getNFTsByOwner(address owner) public view returns (uint256[] memory) {
        return _ownerTokens[owner];
    }

    // Sale Functionality
    function putOnSale(uint256 _tokenId, uint256 _price) external {
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can put the NFT on sale");
        approve(address(this), _tokenId);
        salePrices[_tokenId] = _price;

        emit NFTOnSale(_tokenId, _price, msg.sender);
    }

    function buyNFT(uint256 _tokenId, address buyer) external payable {
        uint256 price = salePrices[_tokenId];
        require(price > 0, "The NFT is not for sale");
        require(msg.value >= price, "Insufficient funds to buy the NFT");

        require(getApproved(_tokenId) == address(this), "Contract is not approved to transfer this NFT");
        address previousOwner = ownerOf(_tokenId);
        safeTransferFrom(previousOwner, buyer, _tokenId);

        salePrices[_tokenId] = 0;

        payable(previousOwner).transfer(msg.value);
        emit NFTSold(_tokenId, price, msg.sender);
    }

    function cancelSale(uint256 _tokenId) external {
        require(salePrices[_tokenId] > 0, "The NFT is not for sale");
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can cancel the sale");
        salePrices[_tokenId] = 0;

        emit SaleCancelled(_tokenId, msg.sender);
    }

    // Auction Functionality
    function createAuction(uint256 _tokenId, uint256 _biddingTime) external {
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can create an auction");
        Auction storage auction = auctions[_tokenId];
        if(auction.ended != true){
            require(auction.owner == address(0), "Auction already exists");
        }

        auction.tokenId = _tokenId;
        auction.owner = payable(msg.sender);
        auction.auctionCloseTime = block.timestamp + _biddingTime;
        auction.ended = false;

        emit AuctionCreated(_tokenId, auction.auctionCloseTime);
    }

    function bid(uint256 _tokenId) external payable {
        Auction storage auction = auctions[_tokenId];
        require(auction.owner != address(0), "Auction does not exist");
        require(block.timestamp <= auction.auctionCloseTime, "Auction has ended");
        require(msg.value > auction.topBid, "There is already a higher bid");

        if (auction.topBidder != address(0)) {
            auction.bids[auction.topBidder] += auction.topBid;
        }

        auction.topBid = msg.value;
        auction.topBidder = payable(msg.sender);
        emit BidPlaced(_tokenId, msg.sender, msg.value);
    }

    function endAuction(uint256 _tokenId) external {
        Auction storage auction = auctions[_tokenId];
        require(auction.owner != address(0), "Auction does not exist");
        require(block.timestamp > auction.auctionCloseTime, "Auction is still ongoing");
        require(!auction.ended, "Auction already ended");
        require(msg.sender == auction.owner, "Only the owner can end the auction");

        auction.ended = true;

        if (auction.topBidder != address(0)) {
            auction.owner.transfer(auction.topBid);
            safeTransferFrom(auction.owner, auction.topBidder, _tokenId);
            emit AuctionEnded(_tokenId, auction.topBidder, auction.topBid);
        }
    }

    function withdraw(uint256 _tokenId) external {
        Auction storage auction = auctions[_tokenId];
        uint256 amount = auction.bids[msg.sender];
        require(amount > 0, "No funds to withdraw");

        auction.bids[msg.sender] = 0;
        payable(msg.sender).transfer(amount);
    }

    // Obtener NFTs a la venta
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

    // Obtener NFTs en subasta
    function getNFTsInAuction() public view returns (uint256[] memory) {
        uint256[] memory inAuctionNFTs = new uint256[](_tokenIds.current());
        uint256 count = 0;

        for (uint256 i = 1; i <= _tokenIds.current(); i++) {
            Auction storage auction = auctions[i];
            if (auction.owner != address(0) && !auction.ended && block.timestamp <= auction.auctionCloseTime) {
                inAuctionNFTs[count] = i;
                count++;
            }
        }

        // Ajustar el tamaño del array a los elementos encontrados
        uint256[] memory result = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = inAuctionNFTs[i];
        }
        return result;
    }

    // Blind Auction Functionality
    function createBlindAuction(uint256 _tokenId, uint256 _biddingTime, uint256 _revealTime) external {
        require(ownerOf(_tokenId) == msg.sender, "Only the owner can create a blind auction");
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        require(blindAuction.owner == address(0), "Blind auction already exists");

        blindAuction.owner = msg.sender;
        blindAuction.tokenId = _tokenId;
        blindAuction.biddingEndTime = block.timestamp + _biddingTime;
        blindAuction.revealEndTime = blindAuction.biddingEndTime + _revealTime;
        blindAuction.auctionEnded = false;

        emit BlindAuctionCreated(_tokenId, blindAuction.biddingEndTime, blindAuction.revealEndTime);
    }

    function placeBlindBid(uint256 _tokenId, bytes32 _hashedBid) external {
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        require(block.timestamp < blindAuction.biddingEndTime, "Bidding time has ended");
        require(blindAuction.bids[msg.sender].hashedBid == 0, "Bid already placed");

        blindAuction.bids[msg.sender] = Bid({
            hashedBid: _hashedBid
        });

        emit BlindBidPlaced(msg.sender, _hashedBid);
    }

    function revealBlindBid(uint256 _tokenId, uint256 _amount, string memory _secret) external {
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        require(block.timestamp >= blindAuction.biddingEndTime, "Bidding time has not ended");
        require(block.timestamp <= blindAuction.revealEndTime, "Reveal time has ended");

        Bid storage bidToCheck = blindAuction.bids[msg.sender];
        require(bidToCheck.hashedBid != 0, "No bid to reveal");

        // Verificar la validez de la puja revelada
        require(bidToCheck.hashedBid == keccak256(abi.encodePacked(_amount, _secret)), "Invalid bid");

        if (_amount > blindAuction.highestBid) {
            blindAuction.highestBid = _amount;
            blindAuction.highestBidder = msg.sender;
        }

        // Reiniciar la puja revelada para evitar reutilización
        bidToCheck.hashedBid = 0;
    }

    function endBlindAuction(uint256 _tokenId) external {
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        require(msg.sender == blindAuction.owner || block.timestamp >= blindAuction.biddingEndTime, "Only the owner can end the auction before time");
        require(!blindAuction.auctionEnded, "Auction already ended");

        blindAuction.auctionEnded = true;

        emit BlindAuctionEnded(blindAuction.highestBidder, blindAuction.highestBid);
    }

    function payForBlindNFT(uint256 _tokenId) external payable {
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        require(blindAuction.auctionEnded, "Auction has not ended");
        require(block.timestamp > blindAuction.revealEndTime, "Reveal time has not ended");
        require(msg.sender == blindAuction.highestBidder, "Only the highest bidder can pay for the NFT");
        require(msg.value == blindAuction.highestBid, "Sent amount does not match the highest bid");

        emit NFTPaid(blindAuction.highestBidder, msg.value);
    }

    function withdrawBlindFunds(uint256 _tokenId) external {
        BlindAuction storage blindAuction = blindAuctions[_tokenId];
        uint256 amount = address(this).balance;
        require(amount > 0, "No funds to withdraw");
        require(msg.sender == blindAuction.owner, "Only the owner can withdraw funds");

        // Transferir el NFT al pujador más alto
        if (blindAuction.highestBidder != address(0)) {
            safeTransferFrom(blindAuction.owner, blindAuction.highestBidder, _tokenId);
            emit NFTPaid(blindAuction.highestBidder, blindAuction.highestBid);
        }

        (bool success, ) = blindAuction.owner.call{value: amount}("");
        require(success, "Transfer failed");

        emit FundsWithdrawn(blindAuction.owner, amount);
    }

    function hashBid(uint256 _amount, string memory _secret) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_amount, _secret));
    }
}