export class TrieNode {
  startTime: number;
  endTime: number; // exclusive
  depth: number;
  
  parent: TrieNode | null = null;
  children: TrieNode[] = [];
  nextSibling: TrieNode | null = null;
  prevSibling: TrieNode | null = null;
  
  linearIndex: number = -1; // Only for leaves

  constructor(startTime: number, endTime: number, depth: number) {
    this.startTime = startTime;
    this.endTime = endTime;
    this.depth = depth;
  }

  public getFirstLeaf(): TrieNode {
    let curr: TrieNode = this;
    while (curr.children.length > 0) {
      curr = curr.children[0];
    }
    return curr;
  }

  public getAncestorAtDepth(targetDepth: number): TrieNode {
    let curr: TrieNode = this;
    while (curr.parent && curr.depth > targetDepth) {
      curr = curr.parent;
    }
    return curr;
  }
}

export class TrieNavigator {
  root: TrieNode;
  leaves: TrieNode[] = [];
  depthNodes: { [depth: number]: TrieNode[] } = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  constructor() {
    this.root = new TrieNode(0, 600, 1);
    this.depthNodes[1].push(this.root);
    this.buildTrie();
    this.buildLateralLinks();
  }

  private buildTrie() {
    // Level 4 (Depth 2): 5 nodes, 120s each
    for (let i = 0; i < 5; i++) {
       const l4 = new TrieNode(i * 120, (i + 1) * 120, 2);
       l4.parent = this.root;
       this.root.children.push(l4);
       this.depthNodes[2].push(l4);
       
       // Level 3 (Depth 3): 2 nodes per L4, 60s each
       for (let j = 0; j < 2; j++) {
           const l3StartTime = l4.startTime + j * 60;
           const l3 = new TrieNode(l3StartTime, l3StartTime + 60, 3);
           l3.parent = l4;
           l4.children.push(l3);
           this.depthNodes[3].push(l3);
           
           // Level 2 (Depth 4): 3 nodes per L3, 20s each
           for (let k = 0; k < 3; k++) {
              const l2StartTime = l3.startTime + k * 20;
              const l2 = new TrieNode(l2StartTime, l2StartTime + 20, 4);
              l2.parent = l3;
              l3.children.push(l2);
              this.depthNodes[4].push(l2);
              
              // Level 1 (Depth 5): 20 nodes per L2, 1s each (leaves)
              for (let m = 0; m < 20; m++) {
                 const l1StartTime = l2.startTime + m * 1;
                 const l1 = new TrieNode(l1StartTime, l1StartTime + 1, 5);
                 l1.parent = l2;
                 l1.linearIndex = this.leaves.length;
                 l2.children.push(l1);
                 this.depthNodes[5].push(l1);
                 this.leaves.push(l1);
              }
           }
       }
    }
  }

  private buildLateralLinks() {
    for (let depth = 1; depth <= 5; depth++) {
      const nodes = this.depthNodes[depth];
      for (let i = 0; i < nodes.length; i++) {
        nodes[i].prevSibling = i > 0 ? nodes[i-1] : null;
        nodes[i].nextSibling = i < nodes.length - 1 ? nodes[i+1] : null;
      }
    }
  }

  public getLeafAt(index: number): TrieNode {
    return this.leaves[Math.max(0, Math.min(index, this.leaves.length - 1))];
  }
}
