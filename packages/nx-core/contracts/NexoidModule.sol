// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/INexoidModule.sol";

/**
 * @title NexoidModule
 * @notice On-chain registry mapping operator Safes to their agent Safes
 *         with embedded scope, credentials, expiry, and status.
 * @dev Flat delegation model: operator → agent only. No sub-delegation chains.
 *      Each operator Safe can register multiple agent Safes. The operator
 *      calls registerAgentSafe via a Safe transaction. Reverse lookup
 *      allows discovering which operator owns a given agent Safe.
 *      Direct O(1) lookup via _agentRecords mapping.
 */
contract NexoidModule is INexoidModule {
    // operatorSafe → agent records (for enumeration)
    mapping(address => AgentRecord[]) private _agents;

    // agentSafe → operatorSafe (reverse lookup)
    mapping(address => address) public operatorOf;

    // agentSafe → AgentRecord (O(1) direct lookup)
    mapping(address => AgentRecord) private _agentRecords;

    modifier onlyOperatorOf(address agentSafe) {
        require(operatorOf[agentSafe] == msg.sender, "Not operator of this agent Safe");
        _;
    }

    /**
     * @inheritdoc INexoidModule
     */
    function registerAgentSafe(
        address agentSafe,
        address agentEOA,
        bytes32 scopeHash,
        bytes32 credentialHash,
        uint64 validUntil
    ) external override {
        require(agentSafe != address(0), "Invalid agent Safe");
        require(agentEOA != address(0), "Invalid agent EOA");
        require(operatorOf[agentSafe] == address(0), "Agent Safe already registered");

        AgentRecord memory record = AgentRecord({
            agentSafe: agentSafe,
            agentEOA: agentEOA,
            createdAt: uint64(block.timestamp),
            scopeHash: scopeHash,
            credentialHash: credentialHash,
            validUntil: validUntil,
            status: DelegationStatus.Active
        });

        _agents[msg.sender].push(record);
        _agentRecords[agentSafe] = record;
        operatorOf[agentSafe] = msg.sender;

        emit AgentSafeRegistered(msg.sender, agentSafe, agentEOA);

        if (scopeHash != bytes32(0) || credentialHash != bytes32(0) || validUntil != 0) {
            emit AgentScopeUpdated(msg.sender, agentSafe, scopeHash, credentialHash, validUntil);
        }
    }

    /**
     * @inheritdoc INexoidModule
     */
    function removeAgentSafe(address agentSafe) external override onlyOperatorOf(agentSafe) {
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
        delete _agentRecords[agentSafe];

        emit AgentSafeRemoved(msg.sender, agentSafe);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function updateAgentScope(
        address agentSafe,
        bytes32 scopeHash,
        bytes32 credentialHash,
        uint64 validUntil
    ) external override onlyOperatorOf(agentSafe) {
        // Update direct lookup
        _agentRecords[agentSafe].scopeHash = scopeHash;
        _agentRecords[agentSafe].credentialHash = credentialHash;
        _agentRecords[agentSafe].validUntil = validUntil;

        // Update array record
        AgentRecord[] storage records = _agents[msg.sender];
        uint256 len = records.length;
        for (uint256 i = 0; i < len; i++) {
            if (records[i].agentSafe == agentSafe) {
                records[i].scopeHash = scopeHash;
                records[i].credentialHash = credentialHash;
                records[i].validUntil = validUntil;
                break;
            }
        }

        emit AgentScopeUpdated(msg.sender, agentSafe, scopeHash, credentialHash, validUntil);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function suspendAgent(address agentSafe) external override onlyOperatorOf(agentSafe) {
        require(
            _agentRecords[agentSafe].status == DelegationStatus.Active,
            "Can only suspend active agent"
        );

        _agentRecords[agentSafe].status = DelegationStatus.Suspended;
        _updateArrayStatus(agentSafe, DelegationStatus.Suspended);

        emit AgentStatusChanged(msg.sender, agentSafe, DelegationStatus.Suspended);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function revokeAgent(address agentSafe) external override onlyOperatorOf(agentSafe) {
        require(
            _agentRecords[agentSafe].status != DelegationStatus.Revoked,
            "Already revoked"
        );

        _agentRecords[agentSafe].status = DelegationStatus.Revoked;
        _updateArrayStatus(agentSafe, DelegationStatus.Revoked);

        emit AgentStatusChanged(msg.sender, agentSafe, DelegationStatus.Revoked);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function reactivateAgent(address agentSafe) external override onlyOperatorOf(agentSafe) {
        require(
            _agentRecords[agentSafe].status == DelegationStatus.Suspended,
            "Can only reactivate suspended agent"
        );

        _agentRecords[agentSafe].status = DelegationStatus.Active;
        _updateArrayStatus(agentSafe, DelegationStatus.Active);

        emit AgentStatusChanged(msg.sender, agentSafe, DelegationStatus.Active);
    }

    /**
     * @inheritdoc INexoidModule
     */
    function isValidAgent(address agentSafe) external view override returns (bool valid) {
        if (operatorOf[agentSafe] == address(0)) return false;

        AgentRecord memory record = _agentRecords[agentSafe];
        if (record.status != DelegationStatus.Active) return false;
        if (record.validUntil != 0 && block.timestamp > record.validUntil) return false;

        return true;
    }

    /**
     * @inheritdoc INexoidModule
     */
    function getAgentRecord(address agentSafe) external view override returns (AgentRecord memory) {
        require(operatorOf[agentSafe] != address(0), "Agent not registered");
        return _agentRecords[agentSafe];
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

    /**
     * @dev Update status in the array storage (keeps array and direct lookup in sync).
     */
    function _updateArrayStatus(address agentSafe, DelegationStatus newStatus) private {
        address op = operatorOf[agentSafe];
        AgentRecord[] storage records = _agents[op];
        uint256 len = records.length;
        for (uint256 i = 0; i < len; i++) {
            if (records[i].agentSafe == agentSafe) {
                records[i].status = newStatus;
                break;
            }
        }
    }
}
