// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IDelegationRegistry.sol";
import "./interfaces/IIdentityRegistry.sol";

/**
 * @title DelegationRegistry
 * @notice Scoped delegation management for Nexoid — stores delegation chains with chain-breaking revocation
 * @dev Chain-breaking revocation (D-15): revoking one link invalidates all downstream.
 *      Verifiers walk the full chain; no expensive O(n) propagation needed.
 */
contract DelegationRegistry is IDelegationRegistry {
    IIdentityRegistry public immutable identityRegistry;

    uint256 private _nextDelegationId = 1;
    mapping(uint256 => DelegationRecord) private _delegations;

    constructor(address _identityRegistry) {
        identityRegistry = IIdentityRegistry(_identityRegistry);
    }

    modifier onlyIssuer(uint256 delegationId) {
        require(
            msg.sender == _delegations[delegationId].issuer,
            "Not the issuer"
        );
        _;
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function delegateWithScope(
        address subject,
        bytes32 credentialHash,
        bytes32 scopeHash,
        uint64 validUntil,
        uint256 parentDelegationId,
        uint8 delegationDepth
    ) external override returns (uint256 delegationId) {
        // Issuer must be registered and active
        require(identityRegistry.isRegistered(msg.sender), "Issuer not registered");
        IIdentityRegistry.IdentityRecord memory issuerRecord = identityRegistry.getIdentity(msg.sender);
        require(
            issuerRecord.status == IIdentityRegistry.EntityStatus.Active,
            "Issuer not active"
        );

        // Subject must be registered and active
        require(identityRegistry.isRegistered(subject), "Subject not registered");
        IIdentityRegistry.IdentityRecord memory subjectRecord = identityRegistry.getIdentity(subject);
        require(
            subjectRecord.status == IIdentityRegistry.EntityStatus.Active,
            "Subject not active"
        );

        require(validUntil > block.timestamp, "validUntil must be in the future");

        // If this is a sub-delegation, validate parent chain
        if (parentDelegationId != 0) {
            DelegationRecord memory parent = _delegations[parentDelegationId];
            require(parent.subject == msg.sender, "Not authorized by parent delegation");
            require(parent.delegationDepth > 0, "Parent does not allow sub-delegation");
            require(
                delegationDepth < parent.delegationDepth,
                "Sub-delegation depth must be less than parent"
            );
            require(validUntil <= parent.validUntil, "Cannot exceed parent validity");

            // Validate parent chain is valid
            (bool parentValid, ) = isValidDelegation(parentDelegationId);
            require(parentValid, "Parent delegation chain is invalid");
        } else {
            // Root delegation: issuer must be the owner of the subject
            require(
                identityRegistry.ownerOf(subject) == msg.sender,
                "Only owner can create root delegation"
            );
        }

        delegationId = _nextDelegationId++;
        _delegations[delegationId] = DelegationRecord({
            issuer: msg.sender,
            subject: subject,
            credentialHash: credentialHash,
            scopeHash: scopeHash,
            validFrom: uint64(block.timestamp),
            validUntil: validUntil,
            parentDelegationId: parentDelegationId,
            delegationDepth: delegationDepth,
            status: DelegationStatus.Active
        });

        emit DelegationCreated(
            delegationId,
            msg.sender,
            subject,
            scopeHash,
            delegationDepth,
            validUntil
        );
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function revokeDelegation(
        uint256 delegationId
    ) external override onlyIssuer(delegationId) {
        require(
            _delegations[delegationId].status != DelegationStatus.Revoked,
            "Already revoked"
        );
        _delegations[delegationId].status = DelegationStatus.Revoked;
        emit DelegationRevoked(delegationId, msg.sender);
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function suspendDelegation(
        uint256 delegationId
    ) external override onlyIssuer(delegationId) {
        require(
            _delegations[delegationId].status == DelegationStatus.Active,
            "Can only suspend active delegation"
        );
        _delegations[delegationId].status = DelegationStatus.Suspended;
        emit DelegationSuspended(delegationId, msg.sender);
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function reactivateDelegation(
        uint256 delegationId
    ) external override onlyIssuer(delegationId) {
        require(
            _delegations[delegationId].status == DelegationStatus.Suspended,
            "Can only reactivate suspended delegation"
        );
        _delegations[delegationId].status = DelegationStatus.Active;
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function isValidDelegation(
        uint256 delegationId
    ) public view override returns (bool valid, uint8 depth) {
        if (delegationId == 0) return (false, 0);

        DelegationRecord memory record = _delegations[delegationId];

        // Check this node
        if (record.status != DelegationStatus.Active) return (false, 0);
        if (block.timestamp < record.validFrom || block.timestamp > record.validUntil) {
            return (false, 0);
        }

        // Check issuer identity is still active
        if (!identityRegistry.isRegistered(record.issuer)) return (false, 0);
        IIdentityRegistry.IdentityRecord memory issuerIdentity = identityRegistry.getIdentity(record.issuer);
        if (issuerIdentity.status != IIdentityRegistry.EntityStatus.Active) return (false, 0);

        // Check subject identity is still active
        if (!identityRegistry.isRegistered(record.subject)) return (false, 0);
        IIdentityRegistry.IdentityRecord memory subjectIdentity = identityRegistry.getIdentity(record.subject);
        if (subjectIdentity.status != IIdentityRegistry.EntityStatus.Active) return (false, 0);

        // Walk parent chain
        if (record.parentDelegationId != 0) {
            (bool parentValid, uint8 parentDepth) = isValidDelegation(record.parentDelegationId);
            if (!parentValid) return (false, 0);
            return (true, parentDepth + 1);
        }

        // Root delegation — valid
        return (true, 0);
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function getDelegation(
        uint256 delegationId
    ) external view override returns (DelegationRecord memory) {
        require(delegationId > 0 && delegationId < _nextDelegationId, "Invalid delegation ID");
        return _delegations[delegationId];
    }

    /**
     * @inheritdoc IDelegationRegistry
     */
    function nextDelegationId() external view override returns (uint256) {
        return _nextDelegationId;
    }
}
