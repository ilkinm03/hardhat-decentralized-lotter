// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/automation/AutomationCompatible.sol";
import "@chainlink/contracts/src/v0.8/vrf/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/vrf/interfaces/VRFCoordinatorV2Interface.sol";

    error Lottery__InsufficientFunds();
    error Lottery__TransferFailed();
    error Lottery__NotOpen();
    error Lottery__UpkeepNotNeeded(uint256 currentBalance, uint256 numPlayers, uint256 lotterState);

/** @title A lottery contract
 *  @author Ilkin Mammadli <ilkinmammadli01@gmail.com>
 *  @notice A smart contract for creating a decentralized lottery game
 *  @dev This smart contract uses ChainLink VRF v2 and ChainLink Keepers
 */
contract Lottery is VRFConsumerBaseV2, AutomationCompatibleInterface {

    /// @notice The possible states of the lottery
    enum LotteryState {OPEN, CALCULATING}

    /// @notice The entrance fee for the lottery
    uint256 private immutable i_entranceFee;
    /// @notice The list of players in the lottery
    address payable[] private s_players;
    /// @notice The gas lane for the VRF request
    bytes32 private immutable i_gasLane;
    /// @notice The subscription ID for the VRF request
    uint64 private immutable i_subscriptionId;
    /// @notice The interface to the VRF Coordinator
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    /// @notice The gas limit for the VRF callback
    uint32 private immutable i_callbackGasLimit;
    /// @notice The number of confirmations required for the VRF request
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    /// @notice The number of words requested from the VRF
    uint32 private constant NUM_WORDS = 1;
    /// @notice The last timestamp when the lottery was drawn
    uint256 private s_lastTimestamp;

    /// @notice The address of the most recent winner
    address private s_recentWinner;
    /// @notice The current state of the lottery
    LotteryState private s_lotteryState;
    /// @notice The interval for the lottery draw
    uint256 private immutable i_interval;

    /// @notice Event emitted when a player enters the lottery
    event LotteryEnter(address indexed player);
    /// @notice Event emitted when a lottery winner is requested
    event RequestedLotteryWinner(uint256 indexed requestId);
    /// @notice Event emitted when a winner is picked
    event WinnerPicked(address indexed winner);

    /**
     * @dev This modifier checks if the transaction value is greater than or equal to the entrance fee.
     * If the value is less than the entrance fee, it reverts the transaction with a Lottery__InsufficientFunds error.
     */
    modifier requireMinimumValue() {
        if (msg.value < i_entranceFee) {
            revert Lottery__InsufficientFunds();
        }
        _;
    }

    /**
     * @dev This modifier checks if the lottery state is OPEN.
     * If the state is not OPEN, it reverts the transaction with a Lottery__NotOpen error.
     */
    modifier requireLotteryNotEnded() {
        if (s_lotteryState != LotteryState.OPEN) {
            revert Lottery__NotOpen();
        }
        _;
    }

    /**
     * @dev Initializes a new instance of the Lottery contract.
     * @param vrfCoordinatorV2 The address of the VRF Coordinator V2 contract.
     * @param entranceFee The entrance fee for the lottery.
     * @param gasLane The gas lane for the VRF request.
     * @param subscriptionId The subscription ID for the VRF request.
     * @param callbackGasLimit The gas limit for the VRF callback.
     * @param interval The interval for the lottery draw.
     */
    constructor(
        address vrfCoordinatorV2,
        uint256 entranceFee,
        bytes32 gasLane,
        uint64 subscriptionId,
        uint32 callbackGasLimit,
        uint256 interval
    ) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_gasLane = gasLane;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
        s_lotteryState = LotteryState.OPEN;
        s_lastTimestamp = block.timestamp;
        i_interval = interval;
    }

    /**
     * @dev Allows a player to enter the lottery.
     * The function checks if the lottery is not ended and if the transaction value is greater than or equal to the entrance fee.
     * If these conditions are met, the player is added to the lottery and a LotteryEnter event is emitted.
     */
    function enterLottery() public payable requireLotteryNotEnded requireMinimumValue {
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    /**
     * @dev Checks if the upkeep is needed for the lottery.
     * Upkeep is needed if the lottery is open, the interval has passed since the last timestamp, there are players in the lottery, and the contract has a balance.
     * @return upkeepNeeded A boolean indicating whether upkeep is needed.
     */
    function checkUpkeep(
        bytes memory /*checkData*/
    ) public override returns (bool upkeepNeeded, bytes memory /*performData*/) {
        bool isOpen = s_lotteryState == LotteryState.OPEN;
        bool timePassed = (block.timestamp - s_lastTimestamp) > i_interval;
        bool hasPlayers = s_players.length > 0;
        bool hasBalance = address(this).balance > 0;
        upkeepNeeded = (isOpen && timePassed && hasPlayers && hasBalance);
        return (upkeepNeeded, "");
    }

    /**
     * @dev Performs the upkeep of the lottery.
     * The function checks if the upkeep is needed by calling the checkUpkeep function.
     * If the upkeep is not needed, it reverts the transaction with a Lottery__UpkeepNotNeeded error.
     * If the upkeep is needed, it changes the lottery state to CALCULATING and requests random words from the VRF Coordinator.
     * After the request, it emits a RequestedLotteryWinner event with the requestId.
     */
    function performUpkeep(bytes calldata /*performData*/) external {
        (bool upkeepNeeded,) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Lottery__UpkeepNotNeeded(address(this).balance, s_players.length, uint256(s_lotteryState));
        }
        s_lotteryState = LotteryState.CALCULATING;
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_gasLane,
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedLotteryWinner(requestId);
    }

    /**
     * @dev This function is called by the VRF Coordinator contract when it receives a valid VRF proof.
     * It calculates the index of the winner by taking the modulus of the first random word with the number of players.
     * The function then sets the recent winner, resets the lottery state to OPEN, clears the players array, and updates the last timestamp.
     * It then attempts to transfer the contract's balance to the recent winner.
     * If the transfer fails, it reverts the transaction with a Lottery__TransferFailed error.
     * Finally, it emits a WinnerPicked event with the recent winner.
     * @param randomWords The VRF output expanded to the requested number of words.
     */
    function fulfillRandomWords(uint256, uint256[] memory randomWords) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        s_lotteryState = LotteryState.OPEN;
        s_players = new address payable[](0);
        s_lastTimestamp = block.timestamp;
        (bool success,) = recentWinner.call{value: address(this).balance}("");
        if (!success) {
            revert Lottery__TransferFailed();
        }
        emit WinnerPicked(recentWinner);
    }

    /**
     * @dev Returns the entrance fee for the lottery.
     * @return The entrance fee in wei.
     */
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    /**
     * @dev Returns the address of the player at the specified index.
     * @param index The index of the player in the players array.
     * @return The address of the player.
     */
    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    /**
     * @dev Returns the address of the most recent winner.
     * @return The address of the recent winner.
     */
    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }

    /**
     * @dev Returns the current state of the lottery.
     * @return The current state of the lottery.
     */
    function getLotteryState() public view returns (LotteryState) {
        return s_lotteryState;
    }

    /**
     * @dev Returns the number of words requested from the VRF.
     * @return The number of words requested from the VRF.
     */
    function getNumWords() public pure returns (uint32) {
        return NUM_WORDS;
    }

    /**
     * @dev Returns the number of players in the lottery.
     * @return The number of players in the lottery.
     */
    function getNumberOfPlayers() public view returns (uint256) {
        return s_players.length;
    }

    /**
     * @dev Returns the latest timestamp when the lottery was drawn.
     * @return The latest timestamp when the lottery was drawn.
     */
    function getLatestTimestamp() public view returns (uint256) {
        return s_lastTimestamp;
    }

    /**
     * @dev Returns the number of confirmations required for the VRF request.
     * @return The number of confirmations required for the VRF request.
     */
    function getRequestConfirmations() public pure returns (uint16) {
        return REQUEST_CONFIRMATIONS;
    }

    /**
     * @dev Returns the interval for the lottery draw.
     * @return The interval for the lottery draw in seconds.
     */
    function getInterval() public view returns (uint256) {
        return i_interval;
    }
}
