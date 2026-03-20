// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INexoidModule
 * @notice Interface for the NexoidModule — on-chain registry mapping
 *         operator Safes to their agent Safes with embedded scope/status/expiry.
 * @dev Flat delegation model: operator → agent only. No sub-delegation chains.
 *      Revoking an agent in the NexoidModule invalidates everything.
 */
interface INexoidModule {
    enum DelegationStatus { Active, Suspended, Revoked }

    struct AgentRecord {
        address agentSafe;       // Agent's Safe address
        address agentEOA;        // Agent's signing EOA
        uint64 createdAt;        // Registration timestamp
        bytes32 scopeHash;       // keccak256 of AgentScope JSON
        bytes32 credentialHash;  // Hash of off-chain credential
        uint64 validUntil;       // Delegation expiry (0 = no expiry)
        DelegationStatus status; // Active/Suspended/Revoked
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

    event AgentScopeUpdated(
        address indexed operatorSafe,
        address indexed agentSafe,
        bytes32 scopeHash,
        bytes32 credentialHash,
        uint64 validUntil
    );

    event AgentStatusChanged(
        address indexed operatorSafe,
        address indexed agentSafe,
        DelegationStatus newStatus
    );

    /**
     * @notice Register an agent Safe under the calling operator Safe.
     * @param agentSafe The agent's Safe address
     * @param agentEOA The agent's signing EOA address
     * @param scopeHash keccak256 of the AgentScope JSON
     * @param credentialHash Hash of the off-chain credential
     * @param validUntil Expiry timestamp (0 = no expiry)
     */
    function registerAgentSafe(
        address agentSafe,
        address agentEOA,
        bytes32 scopeHash,
        bytes32 credentialHash,
        uint64 validUntil
    ) external;

    /**
     * @notice Remove an agent Safe from the caller's registry.
     * @param agentSafe The agent's Safe address to remove
     */
    function removeAgentSafe(address agentSafe) external;

    /**
     * @notice Update scope, credential, and expiry for an agent.
     * @param agentSafe The agent's Safe address
     * @param scopeHash New scope hash
     * @param credentialHash New credential hash
     * @param validUntil New expiry timestamp (0 = no expiry)
     */
    function updateAgentScope(
        address agentSafe,
        bytes32 scopeHash,
        bytes32 credentialHash,
        uint64 validUntil
    ) external;

    /**
     * @notice Suspend an active agent (reversible).
     * @param agentSafe The agent's Safe address
     */
    function suspendAgent(address agentSafe) external;

    /**
     * @notice Permanently revoke an agent.
     * @param agentSafe The agent's Safe address
     */
    function revokeAgent(address agentSafe) external;

    /**
     * @notice Reactivate a suspended agent.
     * @param agentSafe The agent's Safe address
     */
    function reactivateAgent(address agentSafe) external;

    /**
     * @notice Check if an agent is valid (Active status and not expired).
     * @param agentSafe The agent's Safe address
     * @return valid Whether the agent is currently valid
     */
    function isValidAgent(address agentSafe) external view returns (bool valid);

    /**
     * @notice Get the full agent record by agent Safe address (O(1) lookup).
     * @param agentSafe The agent's Safe address
     * @return The agent record
     */
    function getAgentRecord(address agentSafe) external view returns (AgentRecord memory);

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
