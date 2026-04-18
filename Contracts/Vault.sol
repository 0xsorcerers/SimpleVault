
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/utils/ReentrancyGuard.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/IERC20.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/release-v5.0/contracts/token/ERC20/utils/SafeERC20.sol";

contract Vault is ReentrancyGuard {

    constructor(address _DAO) {
        DAO = _DAO;
    }

    using SafeERC20 for IERC20;

    string public Author = "https://github.com/0xsorcerers";
    bool public paused; 
    address private DAO;
    uint256 public funds;

    modifier onlyDAO() {
        require(msg.sender == DAO, "Not authorized.");
        _;
    }

    struct MarketData {
        address creator;
        uint256 marketBalance;
        uint256 startTime;
        uint256 endTime;
        bool feeType;
        bool closed;
    }

    //Maps
    mapping (uint256 => MarketData) public allMarketData;    
    mapping (uint256 => address) public paymentTokens;

    function deposit(uint256 _marketBalance, bool _feeType, address _paymentToken, uint256 _days) external payable nonReentrant {
        require(!paused && _marketBalance > 0 && (_days > 0), "Call Reverted.");
        uint256 creditBalance;
        uint256 market;

        //payment systems
        if (_feeType) {
            market = ++funds;
            allMarketData[market].creator = msg.sender;
            require(_paymentToken != address(0), "Dropped.");
            uint256 received = transferTokens(_marketBalance, _paymentToken);
            creditBalance = received;
            paymentTokens[market] = _paymentToken;           
        } else {
            market = ++funds;
            allMarketData[market].creator = msg.sender;
            creditBalance = msg.value;
        }
        

        //create MarketData
        allMarketData[market].marketBalance += creditBalance;
        allMarketData[market].endTime = block.timestamp + (_days * 1 days);
        allMarketData[market].feeType = _feeType;
        allMarketData[market].startTime = block.timestamp;
    }

    function withdraw(uint256 _fund, uint256 _amount) external payable nonReentrant {
        require(_fund <= funds, "Non-existent fund.");
        MarketData storage m = allMarketData[_fund];
        address ownership = m.creator;
        require (msg.sender == ownership, "Not authorized");
        require (!m.closed, "Fund closed.");
        require (block.timestamp > m.endTime, "Funds locked!");
        address token = paymentTokens[_fund];

        if (token != address(0)) {
            require (m.marketBalance >= _amount, "Insufficient funds.");
            IERC20 paytoken = IERC20(token); 
            paytoken.safeTransfer(msg.sender, _amount);
            allMarketData[_fund].marketBalance -= _amount;
            if (allMarketData[_fund].marketBalance == 0) {                
                allMarketData[_fund].closed = true;
            }
        } else {
            require (m.marketBalance >= _amount, "Insufficient funds.");
            (bool success, ) = payable(ownership).call{value: _amount}("");
            require(success, "Funds transfer failed.");
            allMarketData[_fund].marketBalance -= _amount;
            if (allMarketData[_fund].marketBalance == 0) {                
                allMarketData[_fund].closed = true;
            }
        }

    }

    function readMarketData(uint256[] calldata _ids) public view returns (MarketData[] memory) {
        require(_ids.length > 0, "Invalid Range Call");
        MarketData[] memory result = new MarketData[](_ids.length);
        for (uint256 i; i < _ids.length; i++) {
            uint256 id = _ids[i];
                result[i] = allMarketData[id];
        }
        return result;
    }
    
    function transferTokens(uint256 _cost, address _paytoken) internal returns (uint256) {
        IERC20 token = IERC20(_paytoken);
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), _cost);
        uint256 received = token.balanceOf(address(this)) - before;
        return received;
    } 

    function setDAOs (address _DAO) external onlyDAO {
        DAO = _DAO; 
    }

    function setState (uint256 _state) external onlyDAO() {
        if (_state > 0) {
            paused = true;
        } else {
            paused = false;
        }
    } 
}
  