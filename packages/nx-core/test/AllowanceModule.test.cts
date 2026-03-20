import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";

describe("AllowanceModule", function () {
  async function deployFixture() {
    const [safe, delegate, delegate2, recipient, stranger] =
      await hre.ethers.getSigners();

    // Deploy mock USDC (6 decimals)
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

    // Deploy test AllowanceModule
    const AllowanceModule = await hre.ethers.getContractFactory("TestAllowanceModule");
    const module = await AllowanceModule.deploy();

    // Mint USDC to the Safe
    const INITIAL_BALANCE = 10000n * 10n ** 6n; // 10,000 USDC
    await usdc.mint(safe.address, INITIAL_BALANCE);

    // Safe approves AllowanceModule to transfer USDC (simulates module being enabled)
    await usdc.connect(safe).approve(await module.getAddress(), INITIAL_BALANCE);

    return {
      module,
      usdc,
      safe,
      delegate,
      delegate2,
      recipient,
      stranger,
      INITIAL_BALANCE,
    };
  }

  // ─── Delegate Management ──────────────────────────────

  describe("Delegate Management", function () {
    it("should add a delegate", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      await expect(module.connect(safe).addDelegate(delegate.address))
        .to.emit(module, "AddDelegate")
        .withArgs(safe.address, delegate.address);
    });

    it("should silently skip duplicate delegate", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      // Should not revert, just no-op
      await module.connect(safe).addDelegate(delegate.address);
    });

    it("should reject zero address delegate", async function () {
      const { module, safe } = await loadFixture(deployFixture);

      await expect(
        module.connect(safe).addDelegate(hre.ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid delegate");
    });

    it("should list delegates via getDelegates", async function () {
      const { module, safe, delegate, delegate2 } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module.connect(safe).addDelegate(delegate2.address);

      const [delegates] = await module.getDelegates(safe.address, 0, 50);
      expect(delegates).to.include(delegate.address);
      expect(delegates).to.include(delegate2.address);
      expect(delegates.length).to.equal(2);
    });

    it("should remove a delegate", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await expect(module.connect(safe).removeDelegate(delegate.address, true))
        .to.emit(module, "RemoveDelegate")
        .withArgs(safe.address, delegate.address);

      const [delegates] = await module.getDelegates(safe.address, 0, 50);
      expect(delegates.length).to.equal(0);
    });

    it("should reject removing non-existent delegate", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      await expect(
        module.connect(safe).removeDelegate(delegate.address, true)
      ).to.be.revertedWith("Not a delegate");
    });
  });

  // ─── Allowance Management ─────────────────────────────

  describe("Allowance Management", function () {
    it("should set an allowance for a delegate", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);

      const amount = 100n * 10n ** 6n; // 100 USDC
      await expect(
        module.connect(safe).setAllowance(
          delegate.address,
          await usdc.getAddress(),
          amount,
          0, // no reset
          0  // reset base = now
        )
      )
        .to.emit(module, "SetAllowance")
        .withArgs(safe.address, delegate.address, await usdc.getAddress(), amount, 0);
    });

    it("should query allowance via getTokenAllowance", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      const amount = 500n * 10n ** 6n; // 500 USDC
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), amount, 1440, 0);

      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );

      expect(result[0]).to.equal(amount); // amount
      expect(result[1]).to.equal(0); // spent
      expect(result[2]).to.equal(1440); // resetTimeMin (daily)
      // result[3] = lastResetMin (set to block.timestamp / 60)
      expect(result[4]).to.equal(0); // nonce
    });

    it("should reject setting allowance for non-delegate", async function () {
      const { module, usdc, safe, stranger } = await loadFixture(deployFixture);

      await expect(
        module
          .connect(safe)
          .setAllowance(stranger.address, await usdc.getAddress(), 100n, 0, 0)
      ).to.be.revertedWith("Not a delegate");
    });

    it("should track tokens for a delegate", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);

      const trackedTokens = await module.getTokens(safe.address, delegate.address);
      expect(trackedTokens).to.include(await usdc.getAddress());
    });

    it("should delete allowance", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);
      await module
        .connect(safe)
        .deleteAllowance(delegate.address, await usdc.getAddress());

      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[0]).to.equal(0);
    });

    it("should reset spent amount", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      const amount = 100n * 10n ** 6n;
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), amount, 0, 0);

      // Spend 50 USDC
      await module
        .connect(delegate)
        .executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          50n * 10n ** 6n,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        );

      // Check spent = 50
      let result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[1]).to.equal(50n * 10n ** 6n);

      // Reset
      await module
        .connect(safe)
        .resetAllowance(delegate.address, await usdc.getAddress());

      result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[1]).to.equal(0);
    });
  });

  // ─── Transfer Execution ───────────────────────────────

  describe("Transfer Execution", function () {
    it("should execute allowance transfer from delegate", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      const allowanceAmount = 100n * 10n ** 6n;
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), allowanceAmount, 0, 0);

      const transferAmount = 25n * 10n ** 6n; // 25 USDC

      await expect(
        module.connect(delegate).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          transferAmount,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x" // Signature not verified in test module
        )
      )
        .to.emit(module, "ExecuteAllowanceTransfer");

      // Verify balances
      expect(await usdc.balanceOf(recipient.address)).to.equal(transferAmount);
      expect(await usdc.balanceOf(safe.address)).to.equal(10000n * 10n ** 6n - transferAmount);

      // Verify spent tracking
      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[1]).to.equal(transferAmount); // spent
      expect(result[4]).to.equal(1); // nonce incremented
    });

    it("should reject transfer exceeding allowance", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 50n * 10n ** 6n, 0, 0);

      await expect(
        module.connect(delegate).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          51n * 10n ** 6n, // 51 USDC > 50 allowance
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");
    });

    it("should reject transfer from non-delegate caller", async function () {
      const { module, usdc, safe, delegate, stranger, recipient } =
        await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);

      await expect(
        module.connect(stranger).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          10n * 10n ** 6n,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        )
      ).to.be.revertedWith("Caller must be delegate");
    });

    it("should reject transfer with no allowance set", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      // Not even a delegate
      await expect(
        module.connect(delegate).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          10n * 10n ** 6n,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        )
      ).to.be.revertedWith("No allowance set");
    });

    it("should allow multiple transfers within allowance", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);

      // Transfer 1: 30 USDC
      await module.connect(delegate).executeAllowanceTransfer(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        30n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        delegate.address,
        "0x"
      );

      // Transfer 2: 40 USDC
      await module.connect(delegate).executeAllowanceTransfer(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        40n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        delegate.address,
        "0x"
      );

      // Transfer 3: 31 USDC — should fail (30+40+31 > 100)
      await expect(
        module.connect(delegate).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          31n * 10n ** 6n,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        )
      ).to.be.revertedWith("Allowance exceeded");

      // Transfer 3b: 30 USDC — should succeed (30+40+30 = 100)
      await module.connect(delegate).executeAllowanceTransfer(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        30n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        delegate.address,
        "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(100n * 10n ** 6n);

      // Nonce should be 3
      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[4]).to.equal(3);
    });

    it("should support multiple delegates independently", async function () {
      const { module, usdc, safe, delegate, delegate2, recipient } =
        await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module.connect(safe).addDelegate(delegate2.address);

      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);
      await module
        .connect(safe)
        .setAllowance(delegate2.address, await usdc.getAddress(), 200n * 10n ** 6n, 0, 0);

      // Delegate 1 spends 80
      await module.connect(delegate).executeAllowanceTransfer(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        80n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        delegate.address,
        "0x"
      );

      // Delegate 2 can still spend up to 200
      await module.connect(delegate2).executeAllowanceTransfer(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        150n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        delegate2.address,
        "0x"
      );

      expect(await usdc.balanceOf(recipient.address)).to.equal(230n * 10n ** 6n);
    });
  });

  // ─── Hash Generation ──────────────────────────────────

  describe("Hash Generation", function () {
    it("should generate deterministic transfer hash", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      const hash1 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        100n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        0
      );

      const hash2 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        100n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        0
      );

      expect(hash1).to.equal(hash2);
    });

    it("should produce different hash for different nonce", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      const hash0 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        100n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        0
      );

      const hash1 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        100n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        1
      );

      expect(hash0).to.not.equal(hash1);
    });

    it("should produce different hash for different amount", async function () {
      const { module, usdc, safe, recipient } = await loadFixture(deployFixture);

      const hash100 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        100n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        0
      );

      const hash200 = await module.generateTransferHash(
        safe.address,
        await usdc.getAddress(),
        recipient.address,
        200n * 10n ** 6n,
        hre.ethers.ZeroAddress,
        0,
        0
      );

      expect(hash100).to.not.equal(hash200);
    });
  });

  // ─── Calldata Encoding (validates nx-core encoders match contract interface) ──

  describe("Calldata Encoding Compatibility", function () {
    it("addDelegate calldata should be decodable", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      // This validates that if we send the encoded calldata as a transaction,
      // the contract correctly processes it.
      const iface = module.interface;
      const calldata = iface.encodeFunctionData("addDelegate", [delegate.address]);

      // Send raw calldata to the contract
      await safe.sendTransaction({
        to: await module.getAddress(),
        data: calldata,
      });

      const [delegates] = await module.getDelegates(safe.address, 0, 50);
      expect(delegates).to.include(delegate.address);
    });

    it("setAllowance calldata should be decodable", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);

      const iface = module.interface;
      const amount = 250n * 10n ** 6n;
      const calldata = iface.encodeFunctionData("setAllowance", [
        delegate.address,
        await usdc.getAddress(),
        amount,
        1440, // daily reset
        0,
      ]);

      await safe.sendTransaction({
        to: await module.getAddress(),
        data: calldata,
      });

      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[0]).to.equal(amount);
      expect(result[2]).to.equal(1440);
    });

    it("removeDelegate calldata should be decodable", async function () {
      const { module, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);

      const iface = module.interface;
      const calldata = iface.encodeFunctionData("removeDelegate", [delegate.address, true]);

      await safe.sendTransaction({
        to: await module.getAddress(),
        data: calldata,
      });

      const [delegates] = await module.getDelegates(safe.address, 0, 50);
      expect(delegates.length).to.equal(0);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────

  describe("Edge Cases", function () {
    it("should handle removing delegate and re-adding", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);
      await module.connect(safe).removeDelegate(delegate.address, true);

      // Re-add
      await module.connect(safe).addDelegate(delegate.address);

      // Old allowance should be gone
      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[0]).to.equal(0);
    });

    it("should handle zero-amount allowance", async function () {
      const { module, usdc, safe, delegate, recipient } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 0, 0, 0);

      // Any transfer should fail
      await expect(
        module.connect(delegate).executeAllowanceTransfer(
          safe.address,
          await usdc.getAddress(),
          recipient.address,
          1n,
          hre.ethers.ZeroAddress,
          0,
          delegate.address,
          "0x"
        )
      ).to.be.revertedWith("No allowance set");
    });

    it("should update allowance amount", async function () {
      const { module, usdc, safe, delegate } = await loadFixture(deployFixture);

      await module.connect(safe).addDelegate(delegate.address);
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 100n * 10n ** 6n, 0, 0);

      // Increase to 500
      await module
        .connect(safe)
        .setAllowance(delegate.address, await usdc.getAddress(), 500n * 10n ** 6n, 0, 0);

      const result = await module.getTokenAllowance(
        safe.address,
        delegate.address,
        await usdc.getAddress()
      );
      expect(result[0]).to.equal(500n * 10n ** 6n);
    });
  });
});
