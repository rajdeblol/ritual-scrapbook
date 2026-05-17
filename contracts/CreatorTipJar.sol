// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CreatorTipJar {
    address public immutable owner;

    mapping(string => uint256) public totalTipsByUsername;

    event TipSent(
        address indexed tipper,
        string indexed username,
        string xUserId,
        uint256 amount,
        string profileImageUrl,
        string message,
        uint256 timestamp
    );

    event EscrowWithdrawn(address indexed to, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address ownerAddress) {
        require(ownerAddress != address(0), "Owner required");
        owner = ownerAddress;
    }

    function tipCreator(
        string calldata username,
        string calldata xUserId,
        string calldata profileImageUrl,
        string calldata message
    ) external payable {
        require(bytes(username).length > 0, "Username required");
        require(bytes(xUserId).length > 0, "X user id required");
        require(msg.value > 0, "Tip amount required");

        totalTipsByUsername[username] += msg.value;

        emit TipSent(
            msg.sender,
            username,
            xUserId,
            msg.value,
            profileImageUrl,
            message,
            block.timestamp
        );
    }

    // Escrow owner can move accumulated funds. In a later phase,
    // this should be replaced with a creator-claim flow.
    function withdrawEscrow(address payable recipient, uint256 amount) external onlyOwner {
        require(recipient != address(0), "Recipient required");
        require(amount <= address(this).balance, "Insufficient balance");
        recipient.transfer(amount);
        emit EscrowWithdrawn(recipient, amount);
    }
}
