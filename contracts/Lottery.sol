// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";

    error Lottery_InsufficientFunds();

contract Lottery is VRFConsumerBaseV2 {

    uint256 private immutable i_entranceFee;
    address payable[] private s_players;

    event LotteryEnter(address indexed player);

    modifier requireMinimumValue() {
        if (msg.value < i_entranceFee) {
            revert Lottery_InsufficientFunds();
        }
        _;
    }

    constructor(uint256 _entranceFee) {
        i_entranceFee = _entranceFee;
    }

    function enterLottery() public payable requireMinimumValue {
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }
}
