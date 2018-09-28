pragma solidity ^0.4.24;

import "openzeppelin-solidity/contracts/token/ERC721/ERC721Full.sol";
import "openzeppelin-solidity/contracts/token/ERC721/ERC721Mintable.sol";

contract ExampleERC721 is ERC721Full, ERC721Mintable
{
    constructor() public 
        ERC721Full("Yo", "y")
    {}
}