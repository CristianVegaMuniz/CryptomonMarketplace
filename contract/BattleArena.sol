// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./NFTMarket.sol";

contract BattleArena is Ownable {

        DecentralisedNFTMarket public nftMarket;

        struct NFTAttributes {
            uint256 strength;
            uint256 agility;
            uint256 intelligence;
            uint256 experience;
            uint256 level;
            uint256 availablePoints;
        }

        struct BattleRequest {
            address challenger;
            address opponent;
            uint256 challengerNFT;
            uint256 opponentNFT;
            uint256 betAmount;
            bool accepted;
            bool completed;
            address winner;
        }

        mapping(uint256 => NFTAttributes) public nftAttributes;
        uint256 public battleCounter;
        mapping(uint256 => BattleRequest) public battles;
        mapping(address => uint256[]) public userBattles;
        uint256[] public recycledBattleIds;

        constructor(address nftMarketAddress) Ownable(nftMarketAddress){
            nftMarket = DecentralisedNFTMarket(nftMarketAddress);
        }

        event BattleCreated(uint256 battleId, address challenger, uint256 challengerNFT, uint256 betAmount);
        event BattleAccepted(uint256 battleId, address opponent, uint256 opponentNFT);
        event BattleCompleted(uint256 battleId, address winner);
        event BattleCanceled(uint256 battleId, address canceledBy);

        function getNFTAttributes(uint256 tokenId) public view returns (BattleArena.NFTAttributes memory) {
            return nftAttributes[tokenId];
        }

        function setNFTAttributes(uint256 tokenId, uint256 strength, uint256 agility, uint256 intelligence) external {
            nftAttributes[tokenId] = BattleArena.NFTAttributes({
            strength: strength,
            agility: agility,
            intelligence: intelligence,
            experience: 0,
            level: 0,
            availablePoints: 0
        });
        }

        function allocatePoints(uint256 tokenId, uint256 strengthPoints, uint256 agilityPoints, uint256 intelligencePoints) external {
            require(nftMarket.ownerOf(tokenId) == msg.sender, "Only owner can allocate points");
            NFTAttributes storage attributes = nftAttributes[tokenId];
            require(
                strengthPoints + agilityPoints + intelligencePoints <= attributes.availablePoints,
                "Not enough points"
            );

            attributes.strength += strengthPoints;
            attributes.agility += agilityPoints;
            attributes.intelligence += intelligencePoints;
            attributes.availablePoints -= (strengthPoints + agilityPoints + intelligencePoints);
        }

        function increaseExperience(uint256 tokenId, uint256 experience) internal {
            NFTAttributes storage attributes = nftAttributes[tokenId];
            attributes.experience += experience;

            while (attributes.experience >= levelUpExperience(attributes.level)) {
                attributes.experience -= levelUpExperience(attributes.level);
                attributes.level++;
                attributes.availablePoints += 5; // Points granted on leveling up
            }
        }

        function levelUpExperience(uint256 level) public pure returns (uint256) {
            return (level + 1) * 100; // Example: Level 1 needs 100 XP, Level 2 needs 200 XP, etc.
        }

        /*******      COMBAT PART     ********/

        function createBattle(uint256 challengerNFT, uint256 opponentNFT) external payable {
            require(nftMarket.ownerOf(challengerNFT) == msg.sender, "You do not own this NFT");

            uint256 battleId;

            // Reutilizar un ID eliminado si está disponible
            if (recycledBattleIds.length > 0) {
                battleId = recycledBattleIds[recycledBattleIds.length - 1]; // Tomar el último ID reciclado
                recycledBattleIds.pop(); // Eliminarlo de la lista de reciclados
            } else {
                battleCounter++;
                battleId = battleCounter;
            }
            address enemy = nftMarket.ownerOf(opponentNFT);

            battles[battleId] = BattleRequest({
                challenger: msg.sender,
                opponent: enemy,
                challengerNFT: challengerNFT,
                opponentNFT: opponentNFT,
                betAmount: msg.value,
                accepted: false,
                completed: false,
                winner: address(0)
            });

            userBattles[msg.sender].push(battleCounter);
            userBattles[enemy].push(battleCounter);
            emit BattleCreated(battleCounter, msg.sender, challengerNFT, battles[battleId].betAmount);
        }

        function acceptBattle(uint256 battleId) external payable {
            BattleRequest storage battle = battles[battleId];
            require(!battle.accepted, "Battle already accepted");
            require(battle.opponent == address(0) || battle.opponent == msg.sender, "Not the chosen opponent");
            require(nftMarket.ownerOf(battle.opponentNFT) == msg.sender, "You do not own this NFT");

            if (battle.betAmount > 0) {
                require(msg.value == battle.betAmount, "Bet amount mismatch");
            }

            battle.accepted = true;
            emit BattleAccepted(battleId, msg.sender, battle.opponentNFT);

            resolveBattle(battleId);
            
            if (battle.betAmount > 0) {
                uint256 totalReward = battle.betAmount * 2;
                payable(battle.winner).transfer(totalReward);
            }
        }

        function cancelBattle(uint256 battleId) external {
            BattleRequest storage battle = battles[battleId];
            
            require(!battle.accepted, "Battle already accepted");
            require(battle.opponent == msg.sender || battle.challenger == msg.sender, "Only the designated opponent or challenger can cancel this battle");

            // If there was a bet amount, refund it to the challenger
            if (battle.betAmount > 0) {
                payable(battle.challenger).transfer(battle.betAmount);
            }

            // Remover batalla del historial de usuarios
            _removeBattleFromUser(battle.challenger, battleId);
            if (battle.opponent != address(0)) {
                _removeBattleFromUser(battle.opponent, battleId);
            }

            // Reciclar el ID de la batalla eliminada
            recycledBattleIds.push(battleId);

            // Eliminar batalla
            delete battles[battleId];

            emit BattleCanceled(battleId, msg.sender);
        }

        function _removeBattleFromUser(address user, uint256 battleId) internal {
            uint256[] storage userBattlesList = userBattles[user];
            for (uint256 i = 0; i < userBattlesList.length; i++) {
                if (userBattlesList[i] == battleId) {
                    userBattlesList[i] = userBattlesList[userBattlesList.length - 1];
                    userBattlesList.pop(); 
                    break;
                }
            }
        }

        function resolveBattle(uint256 battleId) internal {
            BattleRequest storage battle = battles[battleId];
            require(battle.accepted, "Battle not accepted yet");
            require(!battle.completed, "Battle already resolved");

            NFTAttributes memory challengerAttributes = nftAttributes[battle.challengerNFT];
            NFTAttributes memory opponentAttributes = nftAttributes[battle.opponentNFT];

            uint256 challengerPower = calculateCombatPower(battle.challengerNFT, challengerAttributes);
            uint256 opponentPower = calculateCombatPower(battle.opponentNFT, opponentAttributes);

            // Apply luck factor
            uint256 luckChallenger = randomLuck(battle.challengerNFT);
            uint256 luckOpponent = randomLuck(battle.opponentNFT);

            uint256 finalChallengerPower = challengerPower * luckChallenger / 100;
            uint256 finalOpponentPower = opponentPower * luckOpponent / 100;

            address winner = finalChallengerPower >= finalOpponentPower ? battle.challenger : battle.opponent;

            battle.winner = winner;
            battle.completed = true;

            uint256 winnerExperience = 50; // Winner gains 50 XP
            uint256 loserExperience = 20;  // Loser gains 20 XP

            if(winner == battle.challenger){
                increaseExperience(battle.challengerNFT, winnerExperience);
                increaseExperience(battle.opponentNFT, loserExperience);
            }else{
                increaseExperience(battle.opponentNFT, winnerExperience);
                increaseExperience(battle.challengerNFT, loserExperience);
            }

            emit BattleCompleted(battleId, winner);

        }

        function getBattlesByUser(address user) public view returns (uint256[] memory) {
            return userBattles[user];
        }

        function calculateCombatPower(uint256 nftId, NFTAttributes memory attributes) internal view returns (uint256){
            uint256 strengthMultiplier = randomMultiplier(nftId, 1);
            uint256 agilityMultiplier = randomMultiplier(nftId, 2);
            uint256 intelligenceMultiplier = randomMultiplier(nftId, 3);

            return (
                (attributes.strength * strengthMultiplier +
                    attributes.agility * agilityMultiplier +
                    attributes.intelligence * intelligenceMultiplier) *
                (attributes.level + 1)
            );
        }

        function randomMultiplier(uint256 nftId, uint256 seedModifier) internal view returns (uint256) {
            return (uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, nftId, seedModifier))) % 3) + 1;
        }

        function randomLuck(uint256 nftId) internal view returns (uint256) {
            return (uint256(keccak256(abi.encodePacked(block.timestamp, nftId))) % 41) + 80; // Luck factor between 80 and 120
        }

        // function calculateWinProbability(uint256 nft1, uint256 nft2) external view returns (uint256 probability1, uint256 probability2){
        //     // Obtener atributos de los NFTs
        //     NFTAttributes memory attributes1 = nftAttributes[nft1];
        //     NFTAttributes memory attributes2 = nftAttributes[nft2];

        //     // Calcular poder base de combate
        //     uint256 basePower1 = calculateCombatPower(nft1, attributes1);
        //     uint256 basePower2 = calculateCombatPower(nft2, attributes2);

        //     // Promedio de poder final, considerando el rango de suerte
        //     uint256 expectedPower1 = (basePower1 * (80 + 120)) / 200; // Promedio de suerte (80% a 120%)
        //     uint256 expectedPower2 = (basePower2 * (80 + 120)) / 200;

        //     // Determinar probabilidad usando una aproximación simple basada en medias
        //     if (expectedPower1 == expectedPower2) {
        //         probability1 = 50;
        //         probability2 = 50;
        //     } else {
        //         uint256 totalPower = expectedPower1 + expectedPower2;
        //         probability1 = (expectedPower1 * 100) / totalPower;
        //         probability2 = 100 - probability1;
        //     }
        // }

}