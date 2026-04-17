export const vaultAbi = [
  { type: 'constructor', inputs: [{ name: '_DAO', type: 'address', internalType: 'address' }], stateMutability: 'nonpayable' },
  { type: 'function', name: 'funds', inputs: [], outputs: [{ name: '', type: 'uint256', internalType: 'uint256' }], stateMutability: 'view' },
  {
    type: 'function',
    name: 'allMarketData',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [
      { name: 'creator', type: 'address', internalType: 'address' },
      { name: 'marketBalance', type: 'uint256', internalType: 'uint256' },
      { name: 'startTime', type: 'uint256', internalType: 'uint256' },
      { name: 'endTime', type: 'uint256', internalType: 'uint256' },
      { name: 'feeType', type: 'bool', internalType: 'bool' },
      { name: 'closed', type: 'bool', internalType: 'bool' },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'paymentTokens',
    inputs: [{ name: '', type: 'uint256', internalType: 'uint256' }],
    outputs: [{ name: '', type: 'address', internalType: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'payable',
    inputs: [
      { name: '_marketBalance', type: 'uint256', internalType: 'uint256' },
      { name: '_feeType', type: 'bool', internalType: 'bool' },
      { name: '_paymentToken', type: 'address', internalType: 'address' },
      { name: '_days', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'payable',
    inputs: [
      { name: '_fund', type: 'uint256', internalType: 'uint256' },
      { name: '_amount', type: 'uint256', internalType: 'uint256' },
    ],
    outputs: [],
  },
] as const;
