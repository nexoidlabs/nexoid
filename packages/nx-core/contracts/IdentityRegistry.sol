// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IIdentityRegistry.sol";

/**
 * @title IdentityRegistry
 * @notice On-chain identity registry for Nexoid (D-03)
 * @dev Supports four entity types. Humans/Orgs are registered by an authorized
 *      registrar (Nexoid backend) after identity verification. Self-registration
 *      is not permitted — all identities must go through the registrar flow.
 *      Agents are created by registered operators.
 *      DID format: did:nexoid:base:<address>
 */
contract IdentityRegistry is IIdentityRegistry {
    mapping(address => IdentityRecord) private _identities;
    mapping(address => bool) private _registered;

    /// @notice Nexoid admin — can manage registrars. Set to deployer initially.
    address private _admin;

    /// @notice Authorized registrars (Nexoid backend addresses)
    mapping(address => bool) private _registrars;

    modifier onlyAdmin() {
        require(msg.sender == _admin, "Not admin");
        _;
    }

    modifier onlyRegistrar() {
        require(_registrars[msg.sender], "Not registrar");
        _;
    }

    modifier onlyRegistered(address identity) {
        require(_registered[identity], "Identity not registered");
        _;
    }

    modifier onlyOwnerOrSelf(address identity) {
        require(
            msg.sender == identity || msg.sender == _identities[identity].owner,
            "Not authorized"
        );
        _;
    }

    modifier onlyActive(address identity) {
        require(
            _identities[identity].status == EntityStatus.Active,
            "Identity not active"
        );
        _;
    }

    constructor() {
        _admin = msg.sender;
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function registerIdentityFor(
        address owner,
        EntityType entityType,
        bytes32 metadataHash
    ) external override onlyRegistrar {
        require(!_registered[owner], "Already registered");
        require(
            entityType == EntityType.Human || entityType == EntityType.Organization,
            "Only Human or Organization can be registered"
        );
        require(owner != address(0), "Invalid owner address");

        _identities[owner] = IdentityRecord({
            entityType: entityType,
            status: EntityStatus.Active,
            createdAt: uint64(block.timestamp),
            metadataHash: metadataHash,
            owner: owner
        });
        _registered[owner] = true;

        emit IdentityRegistered(owner, entityType, owner, metadataHash);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function setRegistrar(
        address registrar,
        bool authorized
    ) external override onlyAdmin {
        require(registrar != address(0), "Invalid registrar address");
        _registrars[registrar] = authorized;
        emit RegistrarUpdated(registrar, authorized);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function transferAdmin(address newAdmin) external override onlyAdmin {
        require(newAdmin != address(0), "Invalid admin address");
        address oldAdmin = _admin;
        _admin = newAdmin;
        emit AdminTransferred(oldAdmin, newAdmin);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function isRegistrar(address registrar) external view override returns (bool) {
        return _registrars[registrar];
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function admin() external view override returns (address) {
        return _admin;
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function createAgentIdentity(
        address agent,
        EntityType entityType,
        bytes32 metadataHash
    ) external override onlyRegistered(msg.sender) onlyActive(msg.sender) {
        require(!_registered[agent], "Agent already registered");
        require(
            entityType == EntityType.VirtualAgent || entityType == EntityType.PhysicalAgent,
            "Agent must be VirtualAgent or PhysicalAgent"
        );
        // Only Humans or Organizations can create agents
        EntityType operatorType = _identities[msg.sender].entityType;
        require(
            operatorType == EntityType.Human || operatorType == EntityType.Organization,
            "Only Human or Organization can create agents"
        );

        _identities[agent] = IdentityRecord({
            entityType: entityType,
            status: EntityStatus.Active,
            createdAt: uint64(block.timestamp),
            metadataHash: metadataHash,
            owner: msg.sender
        });
        _registered[agent] = true;

        emit IdentityRegistered(agent, entityType, msg.sender, metadataHash);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function updateStatus(
        address identity,
        EntityStatus newStatus
    ) external override onlyRegistered(identity) onlyOwnerOrSelf(identity) {
        EntityStatus currentStatus = _identities[identity].status;

        // Revoked is terminal
        require(currentStatus != EntityStatus.Revoked, "Cannot update revoked identity");

        // Valid transitions: Active -> Suspended, Suspended -> Active, * -> Revoked
        if (newStatus == EntityStatus.Suspended) {
            require(currentStatus == EntityStatus.Active, "Can only suspend active identity");
        } else if (newStatus == EntityStatus.Active) {
            require(currentStatus == EntityStatus.Suspended, "Can only reactivate suspended identity");
        } else if (newStatus == EntityStatus.Revoked) {
            // Any non-revoked status can be revoked
        } else {
            revert("Invalid status transition");
        }

        EntityStatus oldStatus = _identities[identity].status;
        _identities[identity].status = newStatus;

        emit IdentityStatusUpdated(identity, oldStatus, newStatus);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function updateMetadata(
        address identity,
        bytes32 newMetadataHash
    ) external override onlyRegistered(identity) onlyOwnerOrSelf(identity) {
        bytes32 oldHash = _identities[identity].metadataHash;
        _identities[identity].metadataHash = newMetadataHash;

        emit MetadataUpdated(identity, oldHash, newMetadataHash);
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function getIdentity(
        address identity
    ) external view override returns (IdentityRecord memory) {
        require(_registered[identity], "Identity not registered");
        return _identities[identity];
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function isRegistered(address identity) external view override returns (bool) {
        return _registered[identity];
    }

    /**
     * @inheritdoc IIdentityRegistry
     */
    function ownerOf(address identity) external view override returns (address) {
        require(_registered[identity], "Identity not registered");
        return _identities[identity].owner;
    }
}
