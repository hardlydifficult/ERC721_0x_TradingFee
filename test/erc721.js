const {assetDataUtils, ContractWrappers, BigNumber, SignerType, orderHashUtils, signatureUtils, generatePseudoRandomSalt} = require('0x.js')
const {Web3Wrapper}  = require('@0xproject/web3-wrapper');

const ERC721 = artifacts.require("ExampleERC721.sol");

const GANACHE_NETWORK_ID = 50;
const DECIMALS = 18;
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

contract('ERC721', function() 
{
  const contractWrappers = new ContractWrappers(web3.currentProvider, { networkId: GANACHE_NETWORK_ID });
  // This is the WETH address
  const etherTokenAddress = contractWrappers.etherToken.getContractAddressIfExists();
  const web3Wrapper = new Web3Wrapper(web3.currentProvider);
  
  let erc721Instance;

  let deployer;
  let maker;
  let taker;
  let makerAssetData;
  let takerAssetData;

  // Note numbers below are used to highlight each on-chain transaction required.

  beforeEach(async () => 
  {
    [maker, taker, deployer] = await web3Wrapper.getAvailableAddressesAsync();
    erc721Instance = await ERC721.new({from: deployer});

    // Maker setup
    const erc721Address = erc721Instance.address
    const tokenId = new BigNumber(maker);
    makerAssetData = assetDataUtils.encodeERC721AssetData(erc721Address, tokenId);
    // 1) Maker acquires a lock.
    // For this example we'll simply mint a new ERC721 token for the maker
    await erc721Instance.mint(maker, tokenId, { from: deployer });
    // 2) Allow the 0x ERC721 Proxy to move ERC721 tokens on behalf of maker
    // This is required 1 time per Lock type (e.g. I could buy a lock, approve, sell it, buy a new one, and then sell it)
    await contractWrappers.erc721Token.setProxyApprovalForAllAsync(
      erc721Address,
      maker,
      true,
    );

    // Taker setup
    takerAssetData = assetDataUtils.encodeERC20AssetData(etherTokenAddress);
    // 3) Allow the 0x ERC20 Proxy to move WETH on behalf of taker
    // This is required 1 time to enable an account to use WETH
    await contractWrappers.erc20Token.setUnlimitedProxyAllowanceAsync(
      etherTokenAddress,
      taker,
    );
    // 4) Convert ETH into WETH for taker by depositing ETH into the WETH contract
    // This could be more than the takerAssetAmount (to be used for future trades)
    await contractWrappers.etherToken.depositAsync(
      etherTokenAddress,
      Web3Wrapper.toBaseUnitAmount(new BigNumber(1), DECIMALS),
      taker,
    );
  })
  
  it("should transfer ownership", async() =>
  {
    // Pre-condition
    assert.equal((await erc721Instance.balanceOf(maker)).toString(), "1");
    assert.equal((await erc721Instance.balanceOf(taker)).toString(), "0");

    const takerAssetAmount = Web3Wrapper.toBaseUnitAmount(new BigNumber(0.1), DECIMALS);

    // Set up the Order and fill it
    const expirationTimeSeconds = new BigNumber(Date.now()).div(1000).plus(60 * 10).ceil(); 
    // Create the order
    let order = {
        exchangeAddress: contractWrappers.exchange.getContractAddress(),
        makerAddress: maker,
        takerAddress: NULL_ADDRESS,
        senderAddress: NULL_ADDRESS,
        feeRecipientAddress: NULL_ADDRESS,
        expirationTimeSeconds,
        salt: generatePseudoRandomSalt(),
        makerAssetAmount: new BigNumber(1),
        takerAssetAmount,
        makerAssetData,
        takerAssetData,
        makerFee: new BigNumber(0),
        takerFee: new BigNumber(0),
    };
    // Generate the order hash and sign it
    const orderHashHex = orderHashUtils.getOrderHashHex(order);
    order.signature = await signatureUtils.ecSignOrderHashAsync(
        web3.currentProvider,
        orderHashHex,
        maker,
        SignerType.Default,
    );
    // 5) Fill the Order via 0x.js Exchange contract
    await contractWrappers.exchange.fillOrderAsync(order, takerAssetAmount, taker, {
        gasLimit: 400000,
    })

    assert.equal((await erc721Instance.balanceOf(maker)).toString(), "0");
    assert.equal((await erc721Instance.balanceOf(taker)).toString(), "1");
  });
});
