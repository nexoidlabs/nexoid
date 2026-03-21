// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IIdentityRegistry
 * @notice Interface for the Nexoid Identity Registry
 * @dev Four entity types: Human, VirtualAgent, PhysicalAgent, Organization
 *      DID format: did:nexoid:eth:<address>
 */
interface IIdentityRegistry {
    enum EntityType { Human, VirtualAgent, PhysicalAgent, Organization }
    enum EntityStatus { Active, Suspended, Revoked }

    struct IdentityRecord {
        EntityType entityType;
        EntityStatus status;
        uint64 createdAt;
        bytes32 metadataHash;
        address owner; // For agents: operator's address
    }

    event IdentityRegistered(
        address indexed identity,
        EntityType entityType,
        address indexed owner,
        bytes32 metadataHash
    );

    event IdentityStatusUpdated(
        address indexed identity,
        EntityStatus oldStatus,
        EntityStatus newStatus
    );

    event MetadataUpdated(
        address indexed identity,
        bytes32 oldHash,
        bytes32 newHash
    );

    event RegistrarUpdated(address indexed registrar, bool authorized);
    event AdminTransferred(address indexed oldAdmin, address indexed newAdmin);

    /**
     * @notice Register an identity on behalf of a user (registrar only)
     * @dev Called by Nexoid backend after identity verification (e.g., email).
     *      The identity is owned by `owner`, not by the registrar.
     *      This is the only way to register Human/Organization identities —
     *      self-registration is not permitted.
     * @param owner Address that will own the identity (e.g., user's Safe)
     * @param entityType Must be Human or Organization
     * @param metadataHash Hash of off-chain metadata
     */
    function registerIdentityFor(
        address owner,
        EntityType entityType,
        bytes32 metadataHash
    ) external;

    /**
     * @notice Add or remove a registrar (admin only)
     * @param registrar Address to authorize/deauthorize
     * @param authorized True to add, false to remove
     */
    function setRegistrar(address registrar, bool authorized) external;

    /**
     * @notice Transfer admin role to a new address (admin only)
     * @param newAdmin New admin address
     */
    function transferAdmin(address newAdmin) external;

    /**
     * @notice Check if an address is an authorized registrar
     */
    function isRegistrar(address registrar) external view returns (bool);

    /**
     * @notice Get the admin address
     */
    function admin() external view returns (address);

    /**
     * @notice Create an agent identity (only callable by registered operator)
     * @param agent Address for the agent identity
     * @param entityType Must be VirtualAgent or PhysicalAgent
     * @param metadataHash Hash of off-chain metadata
     */
    function createAgentIdentity(
        address agent,
        EntityType entityType,
        bytes32 metadataHash
    ) external;

    /**
     * @notice Update entity status (Active -> Suspended, Suspended -> Active, * -> Revoked)
     * @param identity The identity to update
     * @param newStatus The new status
     */
    function updateStatus(
        address identity,
        EntityStatus newStatus
    ) external;

    /**
     * @notice Update metadata hash
     * @param identity The identity to update
     * @param newMetadataHash New metadata hash
     */
    function updateMetadata(
        address identity,
        bytes32 newMetadataHash
    ) external;

    /**
     * @notice Get an identity record
     * @param identity The address to look up
     * @return The identity record
     */
    function getIdentity(
        address identity
    ) external view returns (IdentityRecord memory);

    /**
     * @notice Check if an address has a registered identity
     * @param identity The address to check
     * @return True if registered
     */
    function isRegistered(address identity) external view returns (bool);

    /**
     * @notice Get the owner of an identity (for agents, returns operator)
     * @param identity The address to check
     * @return Owner address
     */
    function ownerOf(address identity) external view returns (address);
}
