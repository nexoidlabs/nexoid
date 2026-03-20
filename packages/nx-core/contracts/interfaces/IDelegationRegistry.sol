// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IDelegationRegistry
 * @notice Interface for scoped delegation management (D-07)
 * @dev Chain-breaking revocation design (D-15): revoking one node invalidates all downstream
 */
interface IDelegationRegistry {
    enum DelegationStatus { Active, Suspended, Revoked }

    struct DelegationRecord {
        address issuer;
        address subject;
        bytes32 credentialHash;     // Hash of off-chain VC
        bytes32 scopeHash;          // Hash of scope object (4 fields in V1)
        uint64 validFrom;
        uint64 validUntil;
        uint256 parentDelegationId; // 0 for root (operator -> agent)
        uint8 delegationDepth;
        DelegationStatus status;
    }

    event DelegationCreated(
        uint256 indexed delegationId,
        address indexed issuer,
        address indexed subject,
        bytes32 scopeHash,
        uint8 delegationDepth,
        uint64 validUntil
    );

    event DelegationRevoked(
        uint256 indexed delegationId,
        address indexed revokedBy
    );

    event DelegationSuspended(
        uint256 indexed delegationId,
        address indexed suspendedBy
    );

    /**
     * @notice Create a scoped delegation from issuer to subject
     * @param subject Address receiving the delegation
     * @param credentialHash Hash of the off-chain Verifiable Credential
     * @param scopeHash Hash of the scope object
     * @param validUntil Expiry timestamp
     * @param parentDelegationId Parent delegation (0 for root)
     * @param delegationDepth How deep this delegation is (0 = no sub-delegation allowed)
     * @return delegationId The ID of the created delegation
     */
    function delegateWithScope(
        address subject,
        bytes32 credentialHash,
        bytes32 scopeHash,
        uint64 validUntil,
        uint256 parentDelegationId,
        uint8 delegationDepth
    ) external returns (uint256 delegationId);

    /**
     * @notice Revoke a delegation (O(1) gas — chain-breaking design)
     * @param delegationId The delegation to revoke
     */
    function revokeDelegation(uint256 delegationId) external;

    /**
     * @notice Suspend a delegation (reversible)
     * @param delegationId The delegation to suspend
     */
    function suspendDelegation(uint256 delegationId) external;

    /**
     * @notice Reactivate a suspended delegation
     * @param delegationId The delegation to reactivate
     */
    function reactivateDelegation(uint256 delegationId) external;

    /**
     * @notice Validate a delegation chain from subject back to trust anchor
     * @param delegationId The delegation to validate
     * @return valid Whether the full chain is valid
     * @return depth The chain depth
     */
    function isValidDelegation(
        uint256 delegationId
    ) external view returns (bool valid, uint8 depth);

    /**
     * @notice Get a delegation record
     * @param delegationId The delegation ID
     * @return The delegation record
     */
    function getDelegation(
        uint256 delegationId
    ) external view returns (DelegationRecord memory);

    /**
     * @notice Get the next delegation ID (for off-chain tracking)
     * @return The next ID that will be assigned
     */
    function nextDelegationId() external view returns (uint256);
}
