// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/INexoidModule.sol";

/**
 * @title NexoidModule
 * @notice On-chain registry mapping operator Safes to their agent Safes.
 * @dev Each operator Safe can register multiple agent Safes. The operator
 *      calls registerAgentSafe via a Safe transaction. Reverse lookup
 *      allows discovering which operator owns a given agent Safe.
 */
contract NexoidModule is INexoidModule {
    // operatorSafe → agent records
    mapping(address => AgentRecord[]) private _agents;

    // agentSafe → operatorSafe (reverse lookup)
    mapping(address => address) public operatorOf;

    /**
     * @inheritdoc INexoidModule
     */
    function registerAgentSafe(address agentSafe, address agentEOA) external override {
        require(agentSafe != address(0), "Invalid agent Safe");
        require(agentEOA != address(0), "Invalid agent EOA");
        require(operatorOf[agentSafe] == address(0), "Agent Safe already registered");

        _agents[msg.sender].push(AgentRecord({
            agentSafe: agentSafe,
            agentEOA: agentEOA,
            createdAt: uint64(block.timestamp)
        }));

        operatorOf[agentSafe] = msg.sender;

        emit AgentSafeRegistered(msg.sender, agentSafe, agentEOA);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function removeAgentSafe(address agentSafe) external override {
        require(operatorOf[agentSafe] == msg.sender, "Not operator of this agent Safe");

        AgentRecord[] storage records = _agents[msg.sender];
        uint256 len = records.length;
        for (uint256 i = 0; i < len; i++) {
            if (records[i].agentSafe == agentSafe) {
                // Swap-and-pop removal
                records[i] = records[len - 1];
                records.pop();
                break;
            }
        }

        delete operatorOf[agentSafe];

        emit AgentSafeRemoved(msg.sender, agentSafe);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function getAgentSafes(address operatorSafe) external view override returns (AgentRecord[] memory) {
        return _agents[operatorSafe];
    }

    /**
     * @inheritdoc INexoidModule
     */
    function getOperator(address agentSafe) external view override returns (address) {
        return operatorOf[agentSafe];
    }

    /**
     * @inheritdoc INexoidModule
     */
    function agentCount(address operatorSafe) external view override returns (uint256) {
        return _agents[operatorSafe].length;
    }
}
