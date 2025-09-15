// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC721/ERC721.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v5.0.2/contracts/access/Ownable.sol";

contract EcoTraceDAO is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    /// @notice Types of environmental seals that can be issued
    enum SealType { CARBON_FOOTPRINT, DEFORESTATION_FREE, BIODIVERSITY, REC }
    
    /// @notice Farm information
    struct Farm {
        address farmer;
        string name;
        int256 latitude;           
        int256 longitude;          
        bool isDeforestationFree;
        uint256 registrationDate;
        bool isActive;
    }
    
    /// @notice Product information
    struct Product {
        uint256 farmId;
        string productName;
        uint256 productionDate;
        uint256 quantity;          
        string batchId;
    }
    
    /// @notice Environmental seal metadata
    struct EnvironmentalSeal {
        uint256 productId;
        SealType sealType;
        uint256 carbonFootprint;   
        bool isValid;
        uint256 issuanceDate;
        string verificationData;
    }

    mapping(uint256 => Farm) public farms;
    mapping(uint256 => Product) public products;
    mapping(uint256 => EnvironmentalSeal) public seals;
    mapping(address => uint256[]) public farmerFarms;
    mapping(uint256 => uint256[]) public farmProducts;
    
    uint256 public farmCounter;
    uint256 public productCounter;
    
    event FarmRegistered(uint256 indexed farmId, address indexed farmer, string name);
    event ProductRegistered(uint256 indexed productId, uint256 indexed farmId, string productName);
    event SealIssued(uint256 indexed tokenId, uint256 indexed productId, SealType sealType);
    
    constructor() ERC721("EcoTrace Environmental Seals", "ETES") Ownable(msg.sender) {}

    /// @notice Register a new farm
    function registerFarm(
        string memory _name,
        int256 _latitude,
        int256 _longitude,
        bool _isDeforestationFree
    ) external returns (uint256) {
        farmCounter++;
        farms[farmCounter] = Farm({
            farmer: msg.sender,
            name: _name,
            latitude: _latitude,
            longitude: _longitude,
            isDeforestationFree: _isDeforestationFree,
            registrationDate: block.timestamp,
            isActive: true
        });
        farmerFarms[msg.sender].push(farmCounter);
        emit FarmRegistered(farmCounter, msg.sender, _name);
        return farmCounter;
    }
    
    /// @notice Register a new product linked to a farm
    function registerProduct(
        uint256 _farmId,
        string memory _productName,
        uint256 _quantity,
        string memory _batchId
    ) external returns (uint256) {
        require(farms[_farmId].farmer == msg.sender, "Not farm owner");
        require(farms[_farmId].isActive, "Farm not active");
        
        productCounter++;
        products[productCounter] = Product({
            farmId: _farmId,
            productName: _productName,
            productionDate: block.timestamp,
            quantity: _quantity,
            batchId: _batchId
        });
        farmProducts[_farmId].push(productCounter);
        emit ProductRegistered(productCounter, _farmId, _productName);
        return productCounter;
    }
    
    /// @notice Calculate carbon footprint based on farm and consumer coordinates
    function calculateCarbonFootprint(
        int256 _farmLat,
        int256 _farmLon,
        int256 _consumerLat,
        int256 _consumerLon
    ) public pure returns (uint256) {
        int256 dLat = _consumerLat - _farmLat;
        int256 dLon = _consumerLon - _farmLon;
        uint256 distance = uint256(sqrt(uint256(dLat * dLat + dLon * dLon))) / 1000;
        return distance / 10;
    }
    
    /// @notice Issue a Carbon Footprint seal as an ERC721 token
    function issueCarbonFootprintSeal(
        uint256 _productId,
        int256 _consumerLat,
        int256 _consumerLon,
        string memory _tokenURI
    ) external returns (uint256) {
        require(products[_productId].farmId > 0, "Product doesn't exist");
        
        uint256 farmId = products[_productId].farmId;
        Farm memory farm = farms[farmId];
        
        uint256 carbonFootprint = calculateCarbonFootprint(
            farm.latitude,
            farm.longitude,
            _consumerLat,
            _consumerLon
        );
        
        uint256 tokenId = ++_nextTokenId;
        seals[tokenId] = EnvironmentalSeal({
            productId: _productId,
            sealType: SealType.CARBON_FOOTPRINT,
            carbonFootprint: carbonFootprint,
            isValid: true,
            issuanceDate: block.timestamp,
            verificationData: ""
        });
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        emit SealIssued(tokenId, _productId, SealType.CARBON_FOOTPRINT);
        return tokenId;
    }
    
    /// @notice Issue a Deforestation-Free seal as an ERC721 token
    function issueDeforestationFreeSeal(
        uint256 _productId,
        string memory _verificationData,
        string memory _tokenURI
    ) external returns (uint256) {
        require(products[_productId].farmId > 0, "Product doesn't exist");
        
        uint256 farmId = products[_productId].farmId;
        Farm memory farm = farms[farmId];
        
        require(farm.farmer == msg.sender, "Not authorized");
        require(farm.isDeforestationFree, "Farm not certified deforestation-free");
        
        uint256 tokenId = ++_nextTokenId;
        seals[tokenId] = EnvironmentalSeal({
            productId: _productId,
            sealType: SealType.DEFORESTATION_FREE,
            carbonFootprint: 0,
            isValid: true,
            issuanceDate: block.timestamp,
            verificationData: _verificationData
        });
        
        _safeMint(msg.sender, tokenId);
        _setTokenURI(tokenId, _tokenURI);
        
        emit SealIssued(tokenId, _productId, SealType.DEFORESTATION_FREE);
        return tokenId;
    }
    
    /// @notice Retrieve details of a farm
    function getFarm(uint256 _farmId) external view returns (Farm memory) {
        return farms[_farmId];
    }

    /// @notice Retrieve details of a product
    function getProduct(uint256 _productId) external view returns (Product memory) {
        return products[_productId];
    }

    /// @notice Retrieve details of a seal
    function getSeal(uint256 _tokenId) external view returns (EnvironmentalSeal memory) {
        return seals[_tokenId];
    }

    /// @notice Retrieve all farms registered by a farmer
    function getFarmerFarms(address _farmer) external view returns (uint256[] memory) {
        return farmerFarms[_farmer];
    }

    /// @notice Retrieve all products linked to a farm
    function getFarmProducts(uint256 _farmId) external view returns (uint256[] memory) {
        return farmProducts[_farmId];
    }
    
    /// @dev Babylonian method for integer square root
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }
    
    /// @inheritdoc ERC721URIStorage
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }
    
    /// @inheritdoc ERC721URIStorage
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
