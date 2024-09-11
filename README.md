## Simple Blockchain Implemented Using TypeScript

# Blockchain Structure
A block contains essential properties such as index, data, timestamp, hash, and the previous block's hash, while the blockchain itself is a series of these blocks linked together by their hashes. The integrity of the blockchain is ensured by validating each block, checking that its index follows the previous block and that its hash matches the block's content. The chapter also explains the role of the genesis block (the first block with no previous hash) and discusses how nodes maintain blockchain consistency by sharing blocks and resolving conflicts, using the longest chain in case of discrepancies.

In addition to the blockchain structure, the chapter introduces a simple HTTP API that allows users to interact with nodes by retrieving blocks, creating new ones, and managing peers. This is achieved through websockets, which handle peer-to-peer communication and synchronization. The blockchain is stored in memory, and no proof-of-work is implemented yet, as this chapter focuses on building the foundation of a blockchain. Future chapters will address mining and other advanced concepts. This implementation serves as a toy model to understand the fundamental principles behind blockchain technology.
