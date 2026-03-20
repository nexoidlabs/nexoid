// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.24;

/**
 * Simplified AllowanceModule for testing.
 * Mirrors the real AllowanceModule interface deployed at 0xCFbFaC74C26F8647cBDb8c5caf80BB5b32E43134.
 *
 * Key behavior:
 * - addDelegate/setAllowance use msg.sender as the Safe address
 * - executeAllowanceTransfer is called directly by the delegate
 * - In production, the Safe calls addDelegate/setAllowance via delegatecall or module tx
 *   Here we simulate by having the Safe address call directly.
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract TestAllowanceModule {
    // Delegate linked list: safe => delegate => nextDelegate
    // sentinel = address(1)
    mapping(address => mapping(address => address)) public delegates;
    // Count of delegates per safe
    mapping(address => uint48) public delegateCount;

    struct Allowance {
        uint96 amount;
        uint96 spent;
        uint16 resetTimeMin;
        uint32 lastResetMin;
        uint16 nonce;
    }

    // safe => delegate => token => Allowance
    mapping(address => mapping(address => mapping(address => Allowance))) public allowances;
    // safe => delegate => tokens list
    mapping(address => mapping(address => address[])) public tokens;

    event AddDelegate(address indexed safe, address indexed delegate);
    event RemoveDelegate(address indexed safe, address indexed delegate);
    event SetAllowance(
        address indexed safe,
        address indexed delegate,
        address token,
        uint96 allowanceAmount,
        uint16 resetTime
    );
    event ExecuteAllowanceTransfer(
        address indexed safe,
        address indexed delegate,
        address token,
        address to,
        uint96 value,
        uint16 nonce
    );

    // --- Delegate Management (msg.sender = Safe) ---

    function addDelegate(address delegate) external {
        address safe = msg.sender;
        require(delegate != address(0) && delegate != address(1), "Invalid delegate");
        // Already added check
        if (delegates[safe][delegate] != address(0)) return;

        if (delegateCount[safe] == 0) {
            delegates[safe][address(1)] = delegate; // sentinel -> first
            delegates[safe][delegate] = address(1); // first -> sentinel
        } else {
            // Insert after sentinel
            address first = delegates[safe][address(1)];
            delegates[safe][address(1)] = delegate;
            delegates[safe][delegate] = first;
        }
        delegateCount[safe]++;
        emit AddDelegate(safe, delegate);
    }

    function removeDelegate(address delegate, bool removeAllowances) external {
        address safe = msg.sender;
        require(delegates[safe][delegate] != address(0), "Not a delegate");

        // Find previous in linked list
        address prev = address(1);
        while (delegates[safe][prev] != delegate) {
            prev = delegates[safe][prev];
            require(prev != address(1), "Delegate not found in list");
        }
        delegates[safe][prev] = delegates[safe][delegate];
        delegates[safe][delegate] = address(0);
        delegateCount[safe]--;

        if (removeAllowances) {
            address[] storage tokenList = tokens[safe][delegate];
            for (uint i = 0; i < tokenList.length; i++) {
                delete allowances[safe][delegate][tokenList[i]];
            }
            delete tokens[safe][delegate];
        }

        emit RemoveDelegate(safe, delegate);
    }

    function getDelegates(
        address safe,
        uint48 start,
        uint8 pageSize
    ) external view returns (address[] memory results, uint48 next) {
        results = new address[](pageSize);
        uint count = 0;

        address current;
        if (start == 0) {
            current = delegates[safe][address(1)];
        } else {
            current = address(uint160(start));
        }

        while (current != address(0) && current != address(1) && count < pageSize) {
            results[count] = current;
            current = delegates[safe][current];
            count++;
        }

        // Resize array
        assembly {
            mstore(results, count)
        }

        if (current != address(0) && current != address(1)) {
            next = uint48(uint160(current));
        }
    }

    // --- Allowance Management (msg.sender = Safe) ---

    function setAllowance(
        address delegate,
        address token,
        uint96 allowanceAmount,
        uint16 resetTimeMin,
        uint32 resetBaseMin
    ) external {
        address safe = msg.sender;
        require(delegates[safe][delegate] != address(0), "Not a delegate");

        Allowance storage a = allowances[safe][delegate][token];
        // Track token if first time
        if (a.amount == 0 && a.nonce == 0) {
            tokens[safe][delegate].push(token);
        }
        a.amount = allowanceAmount;
        a.resetTimeMin = resetTimeMin;
        a.lastResetMin = resetBaseMin != 0 ? resetBaseMin : uint32(block.timestamp / 60);

        emit SetAllowance(safe, delegate, token, allowanceAmount, resetTimeMin);
    }

    function resetAllowance(address delegate, address token) external {
        address safe = msg.sender;
        allowances[safe][delegate][token].spent = 0;
    }

    function deleteAllowance(address delegate, address token) external {
        address safe = msg.sender;
        delete allowances[safe][delegate][token];
    }

    // --- Read Functions ---

    function getTokenAllowance(
        address safe,
        address delegate,
        address token
    ) external view returns (uint256[5] memory) {
        Allowance storage a = allowances[safe][delegate][token];
        return [
            uint256(a.amount),
            uint256(a.spent),
            uint256(a.resetTimeMin),
            uint256(a.lastResetMin),
            uint256(a.nonce)
        ];
    }

    function getTokens(
        address safe,
        address delegate
    ) external view returns (address[] memory) {
        return tokens[safe][delegate];
    }

    // --- Transfer Execution (called by delegate directly) ---

    function executeAllowanceTransfer(
        address safe,
        address token,
        address payable to,
        uint96 amount,
        address /*paymentToken*/,
        uint96 /*payment*/,
        address delegate,
        bytes memory /*signature*/
    ) external {
        // In the real module, signature is verified. For testing, we just check delegate == msg.sender
        require(msg.sender == delegate, "Caller must be delegate");

        Allowance storage a = allowances[safe][delegate][token];
        require(a.amount > 0, "No allowance set");

        // Check reset
        if (a.resetTimeMin > 0) {
            uint32 nowMin = uint32(block.timestamp / 60);
            if (nowMin >= a.lastResetMin + a.resetTimeMin) {
                a.spent = 0;
                a.lastResetMin = nowMin;
            }
        }

        require(a.spent + amount <= a.amount, "Allowance exceeded");
        a.spent += amount;
        a.nonce++;

        // Transfer token from Safe to recipient
        require(IERC20(token).transferFrom(safe, to, amount), "Token transfer failed");

        emit ExecuteAllowanceTransfer(safe, delegate, token, to, amount, a.nonce);
    }

    // --- Hash Generation ---

    function generateTransferHash(
        address safe,
        address token,
        address to,
        uint96 amount,
        address paymentToken,
        uint96 payment,
        uint16 nonce
    ) external view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x00),
                address(this),
                safe,
                token,
                to,
                amount,
                paymentToken,
                payment,
                nonce
            )
        );
    }
}
