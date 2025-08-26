// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * Escrow для BMB.
 * Розподіл:
 *  - без реферала:   90% виконавцю, 10% казні (treasury)
 *  - з рефералом:    90% виконавцю,  5% рефералу, 5% казні
 *
 * Потік:
 *  1) lockFunds(scenarioId, amount) — кошти знімаються з payer (creator) на контракт
 *  2) (одноразово) setScenarioMeta(...) — контракт дізнається виконавця/реферала
 *  3) confirmCompletion(scenarioId) — виплата за згодою сторін (фронт гарантує дві згоди)
 *  4) у разі спору — resolveDisputeToExecutor / resolveDisputeToCustomer (викликає арбітр = owner)
 */
contract Escrow is Ownable {
  using SafeERC20 for IERC20;

  error AlreadyExists();
  error NotLocked();
  error AlreadyPaid();
  error BadAmount();
  error NotPayer();
  error MetaAlreadySet();
  error ZeroAddress();

  struct Scenario {
    address payer;        // замовник (creator)
    address executor;     // виконавець
    address referrer;     // реферал (може бути address(0))
    uint256 amount;       // сума у токенах (в найменших одиницях)
    bool locked;          // кошти заблоковані
    bool paid;            // виплata завершена
  }

  IERC20 public immutable usdt;
  address public treasury; // 10% казні в базовому випадку

  // bps = 1/10000
  uint16 private constant BPS           = 10_000;
  uint16 private constant EXEC_BPS      = 9_000; // 90%
  uint16 private constant NO_REF_BPS    = 1_000; // 10% казні
  uint16 private constant WITH_REF_BPS  =   500; // 5% казні
  uint16 private constant REF_BPS       =   500; // 5% рефералу

  mapping(bytes32 => Scenario) public scenarios;

  constructor(address usdt_, address treasury_) Ownable(msg.sender) {
    if (usdt_ == address(0) || treasury_ == address(0)) revert ZeroAddress();
    usdt = IERC20(usdt_);
    treasury = treasury_;
  }

  // ---- адмін ----
  function setTreasury(address newTreasury) external onlyOwner {
    if (newTreasury == address(0)) revert ZeroAddress();
    treasury = newTreasury;
  }

  // ---- сценарії ----

  /// Блокує кошти під сценарій. Токени переносяться з payer на контракт.
  function lockFunds(bytes32 scenarioId, uint256 amount) external {
    if (amount == 0) revert BadAmount();
    Scenario storage s = scenarios[scenarioId];
    if (s.locked) revert AlreadyExists();

    s.payer = msg.sender;
    s.amount = amount;
    s.locked = true;

    usdt.safeTransferFrom(msg.sender, address(this), amount);
  }

  /// Один раз задає виконавця та реферала (опційно). Лише payer.
  function setScenarioMeta(bytes32 scenarioId, address executor, address referrer) external {
    Scenario storage s = scenarios[scenarioId];
    if (!s.locked) revert NotLocked();
    if (msg.sender != s.payer) revert NotPayer();
    if (s.executor != address(0)) revert MetaAlreadySet();
    if (executor == address(0)) revert ZeroAddress();

    s.executor = executor;
    s.referrer = referrer; // може бути 0x0
  }

  /// Позитивне завершення (фронт гарантує, що обидві сторони погодили завершення).
  /// Викликати може будь-хто зі сторін; виплата станеться один раз.
  function confirmCompletion(bytes32 scenarioId) external {
    Scenario storage s = scenarios[scenarioId];
    if (!s.locked) revert NotLocked();
    if (s.paid) revert AlreadyPaid();
    // необов'язково суворо обмежувати викликача; фронт уже валідує подвійне підтвердження

    _payout(scenarioId, false);
  }

  /// Арбітраж: віддати виконавцю (owner).
  function resolveDisputeToExecutor(bytes32 scenarioId) external onlyOwner {
    Scenario storage s = scenarios[scenarioId];
    if (!s.locked) revert NotLocked();
    if (s.paid) revert AlreadyPaid();
    _payout(scenarioId, false);
  }

  /// Арбітраж: повернути payer (owner).
  function resolveDisputeToCustomer(bytes32 scenarioId) external onlyOwner {
    Scenario storage s = scenarios[scenarioId];
    if (!s.locked) revert NotLocked();
    if (s.paid) revert AlreadyPaid();

    s.paid = true;
    s.locked = false;
    usdt.safeTransfer(s.payer, s.amount);
  }

  // ---- внутрішнє ----
  function _payout(bytes32 scenarioId, bool /*reserved*/) internal {
    Scenario storage s = scenarios[scenarioId];

    // must have executor set
    if (s.executor == address(0)) revert MetaAlreadySet(); // переюзаємо помилку як "meta not set"

    uint256 amount = s.amount;

    // базові частки
    uint256 execPart = (amount * EXEC_BPS) / BPS;

    if (s.referrer == address(0)) {
      // 90/10
      uint256 treasuryPart = (amount * NO_REF_BPS) / BPS;
      usdt.safeTransfer(s.executor, execPart);
      usdt.safeTransfer(treasury, treasuryPart);
    } else {
      // 90/5/5
      uint256 treasuryPart = (amount * WITH_REF_BPS) / BPS;
      uint256 refPart      = (amount * REF_BPS) / BPS;
      usdt.safeTransfer(s.executor, execPart);
      usdt.safeTransfer(treasury, treasuryPart);
      usdt.safeTransfer(s.referrer, refPart);
    }

    s.paid = true;
    s.locked = false;
  }
}
