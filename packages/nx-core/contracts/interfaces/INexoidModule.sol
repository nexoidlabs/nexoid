// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INexoidModule
 * @notice Interface for the NexoidModule — on-chain registry mapping
 *         operator Safes to their agent Safes.
 */
interface INexoidModule {
    struct AgentRecord {
        address agentSafe;   // Agent's Safe address
        address agentEOA;    // Agent's signing EOA
        uint64 createdAt;
    }

    event AgentSafeRegistered(
        address indexed operatorSafe,
        address indexed agentSafe,
        address agentEOA
    );

    event AgentSafeRemoved(
        address indexed operatorSafe,
        address indexed agentSafe
    );

    /**
     * @notice Register an agent Safe under the calling operator Safe.
     * @param agentSafe The agent's Safe address
     * @param agentEOA The agent's signing EOA address
     */
    function registerAgentSafe(address agentSafe, address agentEOA) external;

    /**
     * @notice Remove an agent Safe from the caller's registry.
     * @param agentSafe The agent's Safe address to remove
     */
    function removeAgentSafe(address agentSafe) external;

    /**
     * @notice Get all agent Safes for an operator Safe.
     * @param operatorSafe The operator's Safe address
     * @return Array of AgentRecord structs
     */
    function getAgentSafes(address operatorSafe) external view returns (AgentRecord[] memory);

    /**
     * @notice Get the operator Safe for a given agent Safe.
     * @param agentSafe The agent's Safe address
     * @return The operator Safe address (address(0) if not registered)
     */
    function getOperator(address agentSafe) external view returns (address);

    /**
     * @notice Get the number of agent Safes for an operator.
     * @param operatorSafe The operator's Safe address
     * @return Number of registered agent Safes
     */
    function agentCount(address operatorSafe) external view returns (uint256);
}
