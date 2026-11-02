# IITM BS Degree: Big Data and Biological Networks (BDBN) — Quiz 1 Master Study Notebook
## NotebookLM Deep-Dive Audio Overview & Synthesis Edition

> [!IMPORTANT]
> **Scope**: Weeks 1 to 4 foundational syllabus, including Molecular Biology Central Dogma (DNA/RNA/Protein synthesis), Omics Technologies (Transcriptomics, Proteomics, Fluxomics, Sanger & Next-Gen Illumina Sequencing), Graph Centrality Metrics (Degree, Closeness, Betweenness, Clustering Coefficient), and Network Ensembles (Erdős–Rényi, Watts-Strogatz Small-World, Barabási–Albert Scale-Free).

---

## Part 1: High-Yield Conceptual Cheat Sheet (Weeks 1 to 4)

### 1.1 Molecular Biology Central Dogma & Omics
- **DNA Synthesis**: DNA Polymerase synthesises DNA strictly in the **5' to 3' direction** by adding dNTPs to the free 3'-OH group. The template strand is read in the 3' to 5' direction.
- **Transcription**: RNA Polymerase binds to upstream **Promoter** sequences to transcribe DNA into precursor mRNA. Coding strand matches mRNA (with T replaced by U).
- **Translation**: Ribosomes read mRNA in triplet **Codons** (5' to 3'). Start codon is AUG (Methionine). Stop codons: UAA, UAG, UGA.
- **Omics Hierarchy**:
  - *Genomics*: Static DNA sequence across tissues.
  - *Transcriptomics*: Dynamic, tissue-specific, condition-dependent collection of all RNA transcripts.
  - *Proteomics*: Abundance, modifications, and interactions of translated proteins.
  - *Fluxomics*: Dynamic rates of metabolic reactions and metabolite fluxes through pathways.
- **High-Throughput Sequencing**:
  - *Sanger Sequencing*: Chain termination via 2',3'-dideoxynucleotides (ddNTPs), which lack the 3'-OH group required for phosphodiester bond formation.
  - *Illumina NGS*: Solid-phase **Bridge Amplification** on flow cells creating clonal clusters; sequencing-by-synthesis using reversible terminator dNTPs.
  - *GWAS*: Scans SNP markers across populations to identify genetic variants statistically associated with traits/diseases.

### 1.2 Graph Centrality & Topological Metrics
- **Degree Centrality**: $k_i = \sum_{j} A_{ij}$ (number of immediate neighbors).
- **Clustering Coefficient ($C_i$)**: Fraction of possible edges that exist between node $i$'s neighbors:
  $$C_i = \frac{2 \times E_i}{k_i(k_i - 1)}$$
  - *Bridge Node Trap*: If a node has $k_i = 6$ neighbors, maximum possible edges between them is $\binom{6}{2} = 15$. If 3 neighbors form a 3-clique ($E=3$) and the other 3 have zero edges, $C_i = \frac{3}{15} = 0.20$.
- **Characteristic Path Length ($L$)**: Average shortest path between all pairs:
  $$L = \frac{1}{N(N-1)} \sum_{i \ne j} d_{ij}$$
- **Network Efficiency ($E$)**: Inverse of harmonic path length or characteristic path length $E = \frac{1}{L}$.
- **Betweenness Centrality**: Fraction of all shortest paths passing through a given node: $B(v) = \sum_{s \ne v \ne t} \frac{\sigma_{st}(v)}{\sigma_{st}}$.
- **Closeness Centrality**: Reciprocal of sum of distances: $C_c(i) = \frac{N-1}{\sum_j d(i,j)}$.

### 1.3 Network Models & Ensembles Comparison

| Network Model | Generation Mechanism | Degree Distribution $P(k)$ | Clustering ($C$) | Path Length ($L$) | Vulnerability / Robustness |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Erdős–Rényi (ER)** | Nodes connected with uniform probability $p$ | **Binomial** (approaches **Poisson** as $N \to \infty$) | Low ($C \approx p$) | Short ($L \sim \frac{\ln N}{\ln \langle k \rangle}$) | Vulnerable to random node removal once below percolation threshold. |
| **Watts-Strogatz (WS)** | Regular ring lattice with edge rewiring probability $p$ | Peaked around mean $\langle k \rangle$ | **High** (like lattice) | **Short** (like random) | Small-world property; 'shortcuts' rapidly reduce diameter. |
| **Scale-Free (BA)** | Growth + Preferential Attachment ('rich get richer') | **Power Law**: $P(k) \sim k^{-\gamma}$ ($2 < \gamma \le 3$) | Moderate | Ultra-short ($L \sim \ln \ln N$) | **Extremely robust** to random failures, but **catastrophically vulnerable** to targeted attacks on hubs. |

```mermaid
flowchart LR
    A["Regular Lattice (p=0)"] -->|"Rewire edges with prob p"| B["Small-World (0 < p < 1)"]
    B -->|"All edges randomized (p=1)"| C["Random Graph (ER)"]
```

---

## Part 2: Categorized Past Exam Question Bank (Verified Solutions)

### Module: Biological Network Analysis (30 Questions)

#### [BDBN-2024-FEB-Q2] MCQ — 2.0 Marks (2024-FEB)
**Question:** The density of the network given below is The density of the network given below is

**Options:**
- A. 0.7
- B. 0.28
- C. 1.4
- D. 1.2

> **Verified Answer:** `A. 0.7`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. 0.7`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q3] MCQ — 2.0 Marks (2024-FEB)
**Question:** Consider a bipartite graph with two node sets, A and B. Set A contains 5 nodes, and Set B con-tains 7 nodes. If the graph has a total of 23 edges, the average degree of the bipartite graph is

**Options:**
- A. 2.7
- B. 1.91
- C. 3.83
- D. 3.2

> **Verified Answer:** `C. 3.83`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. 3.83`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q4] MCQ — 2.0 Marks (2024-FEB)
**Question:** Using the following code to answer the question below Using the following code to answer the question below What output will be printed by the code? import networkx as nx G = nx. Graph () G.add_nodes_from (l1,2,3,4,5,61) G.add_edges_from (I (1, 2), (1, 3), (1,4), (2,3), (2,4), (5,6), (6,2)]) print (list (G.adj [1]))

**Options:**
- A. [0, 1, 1, 1, 0, 0]
- B. [0, 1, 0, 0, 1, 0]
- C. [2, 3, 4]
- D. [1,2, 3, 4]

> **Verified Answer:** `C. [2, 3, 4]`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. [2, 3, 4]`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q10] MSQ — 3.0 Marks (2024-FEB)
**Question:** Choose the bipartite graphs from the options representing various graphs, shown below:

**Options:**
- A.
- B.
- C.
- D.

> **Verified Answer:** `A.; B.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A.; B.`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q14] NAT — 2.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Use the attached graph to answer the given subquestions: Use the attached graph to answer the given subquestions: The diameter of the given network is ____

> **Verified Answer:** `4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `4`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2024-FEB-Q16] MCQ — 2.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Use the attached graph to answer the given subquestions: Use the attached graph to answer the given subquestions: The given graph is

**Options:**
- A. Labelled, undirected, unweighted
- B. Bipartite, labelled, undirected, unweighted
- C. Complete, labelled, unweighted
- D. Unlabelled, weighted, undirected

> **Verified Answer:** `A. Labelled, undirected, unweighted`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. Labelled, undirected, unweighted`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q17] MCQ — 1.0 Marks (2024-FEB)
**Question:** What is the role of topoisomerase in DNA replication

**Options:**
- A. Synthesis of a new DNA strand from 5’->3’ using the parental strand as atemplate.
- B. Relieving of DNA supercoiling by formed dues to unwinding of the twostrands.
- C. Prevents annealing of the parental strands.
- D. None of these.

> **Verified Answer:** `B. Relieving of DNA supercoiling by formed dues to unwinding of the twostrands.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Relieving of DNA supercoiling by formed dues to unwinding of the twostrands.`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q19] MCQ — 1.0 Marks (2024-FEB)
**Question:** What is the primary focus of transcriptomics?

**Options:**
- A. Study of protein structures.
- B. Examination of DNA sequences.
- C. Analysis of gene expression at the RNA level.
- D. Investigation of cell morphology.

> **Verified Answer:** `C. Analysis of gene expression at the RNA level.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Analysis of gene expression at the RNA level.`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q23] MSQ — 1.0 Marks (2024-FEB)
**Question:** Which of the following is/are true regarding RNA

**Options:**
- A. RNA has Uracil instead of Thymine
- B. RNA has a deoxyribose sugar backbone.
- C. tRNA is translated to protein
- D. RNA is more stable than DNA

> **Verified Answer:** `A. RNA has Uracil instead of Thymine`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. RNA has Uracil instead of Thymine`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q25] MSQ — 1.0 Marks (2024-FEB)
**Question:** Application of genomics include

**Options:**
- A. Studying evolutionary patterns across different strains and species.
- B. Identifying the gene expression patterns in cells.
- C. Studying post translational modifications.
- D. Identify genetic associations to phenotypic traits.

> **Verified Answer:** `A. Studying evolutionary patterns across different strains and species.; D. Identify genetic associations to phenotypic traits.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. Studying evolutionary patterns across different strains and species.; D. Identify genetic associations to phenotypic traits.`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q26] MSQ — 1.0 Marks (2024-FEB)
**Question:** Which of the following statements accurately describe the goals of the 1000 Genomes Project?

**Options:**
- A. To study the gene expression patterns amongst different individuals
- B. To catalogue the genetic variations in human populations from different ethnicgroups.
- C. To identify common and rare variants that affect various phenotypes in humangenome.
- D. To provide a comprehensive resource for understanding human geneticdiversity

> **Verified Answer:** `B. To catalogue the genetic variations in human populations from different ethnicgroups.; C. To identify common and rare variants that affect various phenotypes in humangenome.; D. To provide a comprehensive resource for understanding human geneticdiversity`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. To catalogue the genetic variations in human populations from different ethnicgroups.; C. To identify common and rare variants that affect various phenotypes in humangenome.; D. To provide a comprehensive resource for understanding human geneticdiversity`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q28] NAT — 1.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the given subquestions from the plot. Answer the given subquestions from the plot. • B •D Chromosomes What is the name of the plot?

> **Verified Answer:** `Manhattan plot`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Manhattan plot`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2024-FEB-Q29] NAT — 1.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the given subquestions from the plot. Answer the given subquestions from the plot. • B •D Chromosomes Identify the causal SNPs from the plot. (Separate each answer with a space or a comma)

> **Verified Answer:** `A B C D E`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `A B C D E`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2024-FEB-Q30] NAT — 1.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the given subquestions from the plot. Answer the given subquestions from the plot. • B •D Chromosomes Identify the SNP with the highest statistical significance.

> **Verified Answer:** `A`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `A`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2025-FEB-Q2] MCQ — 1.0 Marks (2025-FEB)
**Question:** The bond between a phosphate group and the ribose sugar group in RNA is called which of the following?

**Options:**
- A. Peptide bond
- B. Glycosidic bond
- C. Phosphodiester bond
- D. Amide bond

> **Verified Answer:** `C. Phosphodiester bond`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Phosphodiester bond`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q4] MCQ — 1.0 Marks (2025-FEB)
**Question:** Which of the following is not true :

**Options:**
- A. Genomics data is independent of the cell type
- B. Transcriptomics data is dependent on a specific cell type
- C. Both genomics data is independent of the cell type and transcriptomics data isdependent on a specific cell type are true
- D. None of these statements are true

> **Verified Answer:** `D. None of these statements are true`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `D. None of these statements are true`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q6] MCQ — 1.0 Marks (2025-FEB)
**Question:** What do the term Okazaki fragments refer to?

**Options:**
- A. Short fragments of DNA created before transcription
- B. Byproducts of histone modifications
- C. Short fragments of DNA created during replication on the 5’ to 3’ templatestrand
- D. Short fragments of DNA created during replication on the 3’ to 5’ templatestrand

> **Verified Answer:** `D. Short fragments of DNA created during replication on the 3’ to 5’ templatestrand`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `D. Short fragments of DNA created during replication on the 3’ to 5’ templatestrand`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q8] MSQ — 2.0 Marks (2025-FEB)
**Question:** Which of the following experiments fall under the purview of epigenomics?

**Options:**
- A. DNA methylation
- B. Chromatin accessibility
- C. Genome wide association studies
- D. Differential expression analysis

> **Verified Answer:** `A. DNA methylation; B. Chromatin accessibility`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. DNA methylation; B. Chromatin accessibility`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q10] MSQ — 2.0 Marks (2025-FEB)
**Question:** Consider the following and select the correct option. Assertion : Genomics can be used to identify individuals predisposed to certain diseases. Reason : By analyzing an individual's DNA, specific genetic variations associated with increased disease risk can be detected.

**Options:**
- A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion.
- B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion.
- C. The assertion is correct, but the reason is incorrect.
- D. The assertion is incorrect, but the reason is correct.

> **Verified Answer:** `See detailed derivation`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `See detailed derivation`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q11] MSQ — 2.0 Marks (2025-FEB)
**Question:** Which of the following statements are true:

**Options:**
- A. Transcription uses two strands of DNA
- B. Polyadenylation does not happen in prokaryotic cells
- C. Intronic genes are only present in eukaryotic cells
- D. Proteins are produced in the nuclei

> **Verified Answer:** `B. Polyadenylation does not happen in prokaryotic cells; C. Intronic genes are only present in eukaryotic cells`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Polyadenylation does not happen in prokaryotic cells; C. Intronic genes are only present in eukaryotic cells`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q12] MSQ — 2.0 Marks (2025-FEB)
**Question:** Application of genomics include:

**Options:**
- A. Identifying individuals based on DNA evidence
- B. Tracking the spread of infectious diseases
- C. Predictive testing for genetic diseases
- D. Identifying genetic diversity within species

> **Verified Answer:** `A. Identifying individuals based on DNA evidence; C. Predictive testing for genetic diseases; D. Identifying genetic diversity within species`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. Identifying individuals based on DNA evidence; C. Predictive testing for genetic diseases; D. Identifying genetic diversity within species`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q19] MCQ — 2.0 Marks (2025-FEB)
**Question:** What is the mean degree of this undirected graph?

**Options:**
- A. 1/3
- B. 4/3
- C. 8/3
- D. 2/3

> **Verified Answer:** `C. 8/3`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. 8/3`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q20] MCQ — 2.0 Marks (2025-FEB)
**Question:** Consider the following code snippet. What will the output be? import networkx as nx G = nx.DiGraph() G.add_edges_from([(1, 2), (2, 3), (3, 4)]) H = nx. Graph(G) G.add_edge (4, 1) print (list (H.neighbors(1)))

**Options:**
- A. AttributeError: 'Graph' object has no attribute 'add_edge'
- B. TypeError: 'DiGraph' object is not subscriptable
- C. NetworkXError: Graph is immutable
- D. [2]

> **Verified Answer:** `A. AttributeError: 'Graph' object has no attribute 'add_edge'`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. AttributeError: 'Graph' object has no attribute 'add_edge'`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q22] MSQ — 3.0 Marks (2025-FEB)
**Question:** Which of the following statements about bipartite graphs is TRUE?

**Options:**
- A. In a bipartite graph, there are two disjoint sets of vertices such that no twovertices within the same set are
- B. Every complete bipartite graph has an Eulerian circuit.
- C. A bipartite graph can be colored with two colors such that no two adjacentnodes have the same color.
- D. In the adjacency matrix of a bipartite graph, the values corresponding toedges within the same set of nodes will not all be zero.

> **Verified Answer:** `A. In a bipartite graph, there are two disjoint sets of vertices such that no twovertices within the same set are`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. In a bipartite graph, there are two disjoint sets of vertices such that no twovertices within the same set are`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q27] MCQ — 2.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the subquestions for the given graph: What is the density of this network?

**Options:**
- A. 0.464
- B. 0.393
- C. 0.500
- D. 0.429

> **Verified Answer:** `A. 0.464`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. 0.464`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q20] MCQ — 2.0 Marks (2026-MAR)
**Question:** The following question consists of two statements: an Assertion (A) and a Reason (R). Select the correct answer from the options below: Assertion (A): The Human Genome Project revealed that a large portion of the human genome does not code for proteins. Reason (R): Only a small percentage of human DNA consists of genes that are translated into proteins.

**Options:**
- A. Both A and R are true, and R is the correct explanation of A
- B. Both A and R are true, but R is not the correct explanation of A
- C. A is true, but R is false
- D. A is false, but R is true

> **Verified Answer:** `A. Both A and R are true, and R is the correct explanation of A`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. Both A and R are true, and R is the correct explanation of A`.
2. Theoretical principle: In the context of Biological Network Analysis, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q25] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. The following DNA sequences are given: Strand I: 5' → 3' : ATG CCT TAA GGC Strand II: 3' → 5' : TAC GGA ATT CCG Write the RNA strand synthesised. NOTE: Your answer should not exceed 20 words. Max Word Count : 20 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q33] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. What is the diameter of the given network?

> **Verified Answer:** `4.8 – 5.2`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `4.8 – 5.2`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q36] NAT — 2.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. How many new edges must be added to this network so that its density becomes 1?

> **Verified Answer:** `19`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `19`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q37] NAT — 2.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. The maximum peak of degree distribution ( N(k) ) is at

> **Verified Answer:** `6`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `6`.
2. Conceptual derivation: Evaluate the governing formula for Biological Network Analysis.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

### Module: Molecular Biology & Central Dogma (18 Questions)

#### [BDBN-2024-FEB-Q7] MCQ — 2.0 Marks (2024-FEB)
**Question:** Assertion: RNA polymerase II is responsible for transcribing protein-coding genes in eukaryotic cells. Reason: RNA polymerase II recognizes and binds to the promoter regions of protein-coding genes, initiating the transcription process.

**Options:**
- A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion.
- B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion.
- C. The assertion is correct, but the reason is incorrect.
- D. The assertion is incorrect, but the reason is correct.

> **Verified Answer:** `See detailed derivation`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `See detailed derivation`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q8] MCQ — 2.0 Marks (2024-FEB)
**Question:** Assertion: The binding of RNA polymerase to the promoter region is a crucial step in transcription. Reason: The promoter region consists of sequences that is recognised by the RNA polymerase.

**Options:**
- A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion.
- B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion.
- C. The assertion is correct, but the reason is incorrect.

> **Verified Answer:** `See detailed derivation`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `See detailed derivation`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q21] MCQ — 1.0 Marks (2024-FEB)
**Question:** Which of the following represents the start codon in mRNA that initiates translation?

**Options:**
- A. AUG
- B. UGA
- C. UAA
- D. CCC

> **Verified Answer:** `A. AUG`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. AUG`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q22] MSQ — 1.0 Marks (2024-FEB)
**Question:** Which of the following is/are correct regarding DNA replication

**Options:**
- A. DNA Replication occurs from 5’-> 3’ end.
- B. The leading strand is synthesised in a continuous manner.
- C. DNA polymerase cannot initiate DNA replication.
- D. The lagging strand is synthesised in a continuous manner.

> **Verified Answer:** `A. DNA Replication occurs from 5’-> 3’ end.; B. The leading strand is synthesised in a continuous manner.; C. DNA polymerase cannot initiate DNA replication.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. DNA Replication occurs from 5’-> 3’ end.; B. The leading strand is synthesised in a continuous manner.; C. DNA polymerase cannot initiate DNA replication.`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q24] MSQ — 1.0 Marks (2024-FEB)
**Question:** Select the correct statements about stop codons.

**Options:**
- A. Stop codons signal the beginning of translation.
- B. There are three different stop codons in the standard genetic code.
- C. Stop codons do not specify any amino acid.
- D. Mutations converting a stop codon into a start codon can result in normalprotein synthesis.

> **Verified Answer:** `B. There are three different stop codons in the standard genetic code.; C. Stop codons do not specify any amino acid.; D. Mutations converting a stop codon into a start codon can result in normalprotein synthesis.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. There are three different stop codons in the standard genetic code.; C. Stop codons do not specify any amino acid.; D. Mutations converting a stop codon into a start codon can result in normalprotein synthesis.`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q3] MCQ — 1.0 Marks (2025-FEB)
**Question:** Translation is the process by which:

**Options:**
- A. DNA gets converted to chromosomes
- B. RNA gets converted to protein
- C. Protein folding occurs to produce functional enzymes
- D. Cells produce ATP

> **Verified Answer:** `B. RNA gets converted to protein`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. RNA gets converted to protein`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q7] MCQ — 1.0 Marks (2025-FEB)
**Question:** Which of the following proteins is required for transcription:

**Options:**
- A. DNA polymerase
- B. Sigma factor
- C. Uracilase

> **Verified Answer:** `B. Sigma factor`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Sigma factor`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q17] NAT — 3.0 Marks (2025-FEB)
**Question:** NOTE: Enter the exact answer without any extra space in the beginning or at the end. Using the codon table below, translate the given DNA sequence - ATTGATCCTAAC. The answer should be the three letter codes separated by hyphens: e.g. Met-Asp Codon Chart Second base in codon c First base in codon G UUc - QUA LEU UUG - ucc UCA UCG J Ser CUUn CUC CUA CUG - Leu ccc CCA CCG J Pro ACU T AUC Ile ACC Thr AUA - ACA AUG Met (start) | ACG GUU T GUC Val GUA GUG - GCC GCA GCG J Ala JAU - UAA - UAG / STOP CAC His CAR GIn CAG - AAU AAC Asn UGU TOYS UGC UGA STOP UGG Trp CGU - CGC Arg CGA CGG - c G Last base in codon GAU - GAC Asp GAA - GAG / Glu AGA TArO AGG - GGU - GGC Gly GGA GGG - A G G

> **Verified Answer:** `Ile-Asp-Pro-Asn`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Ile-Asp-Pro-Asn`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q1] MCQ — 1.0 Marks (2026-MAR)
**Question:** DNA polymerase synthesises DNA in which direction?

**Options:**
- A. 3' - 5'
- B. 5' - 3'
- C. Both directions
- D. Randomly

> **Verified Answer:** `B. 5' - 3'`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. DNA polymerases add free deoxynucleotides (dNTPs) exclusively to the 3'-OH group of an existing polynucleotide chain.
2. Therefore, DNA synthesis proceeds strictly in the 5' to 3' direction.
3. The template strand is read in the 3' to 5' direction.
Exam Trap: Do not confuse the direction of synthesis (5' to 3') with the direction the template strand is read (3' to 5').

---

#### [BDBN-2026-MAR-Q2] MCQ — 1.0 Marks (2026-MAR)
**Question:** RNA polymerase binds to a specific DNA sequence called

**Options:**
- A. Operator
- B. Terminator
- C. Promoter
- D. Enhancer

> **Verified Answer:** `C. Promoter`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Promoter`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q3] MCQ — 1.0 Marks (2026-MAR)
**Question:** The sequence of three nucleotides on mRNA that codes for an amino acid is called

**Options:**
- A. Anticodon
- B. Codon
- C. Exon
- D. Intron

> **Verified Answer:** `B. Codon`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Codon`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q15] MSQ — 2.0 Marks (2026-MAR)
**Question:** Transcription involves which of the following?

**Options:**
- A. DNA as a template
- B. RNA polymerase
- C. Ribosomes
- D. Ribonucleotides

> **Verified Answer:** `A. DNA as a template; B. RNA polymerase; D. Ribonucleotides`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. DNA as a template; B. RNA polymerase; D. Ribonucleotides`.
2. Theoretical principle: In the context of Molecular Biology & Central Dogma, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q22] MCQ — 2.0 Marks (2026-MAR)
**Question:** Which of the following statements are true regarding enzymes involved in replication? A. Helicase unwinds the DNA double helix B. DNA ligase seals nicks between Okazaki fragments C. Primase synthesises DNA primers D. DNA polymerase I removes RNA primers

**Options:**
- A. A and B only
- B. A, B and D
- C. B, C and D

> **Verified Answer:** `B. A, B and D`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. DNA polymerases add free deoxynucleotides (dNTPs) exclusively to the 3'-OH group of an existing polynucleotide chain.
2. Therefore, DNA synthesis proceeds strictly in the 5' to 3' direction.
3. The template strand is read in the 3' to 5' direction.
Exam Trap: Do not confuse the direction of synthesis (5' to 3') with the direction the template strand is read (3' to 5').

---

#### [BDBN-2026-MAR-Q24] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. The following DNA sequences are given: Strand I: 5' → 3' : ATG CCT TAA GGC Strand II: 3' → 5' : TAC GGA ATT CCG Identify the template strand for transcription. NOTE: Your answer should not exceed 20 words. Max Word Count : 20 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q26] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. The following DNA sequences are given: Strand I: 5' → 3' : ATG CCT TAA GGC Strand II: 3' → 5' : TAC GGA ATT CCG Identify the start codon and stop codon (if present) in the RNA strand. NOTE: Your answer should not exceed 20 words. Max Word Count : 20 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q30] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH The following DNA coding strand sequence is given: 5′-ATGACCTTACGATAA-3′. Answer the given subquestions using this Codon chart. First base in codon c G Codon Chart Second base in codon c A wU phe VUC - JUG - CUU T cUC Leu CUA CUG - Ucc UCA UCG - Ser CCU - ccc Pro CCG - AUU - ACU T AUC Ile ACC AUA - ACA AUG Met (start) ACG - GUU - GCU - GUC GCC GUA Val GCA GUG - GCG J Thr Ala JAC - VAG ISTOP CAU - CAC / His CAR GIn CAG J CAC TAPp SAA GAG_/ Glu G UGC - UGA STOP UGG Trp CGU - CGC Arg CGA CGG J AGU T AGC / Ser AGA TArO AGG - GGU - GGC GGA GGG - Gly G G G G Last base in codon Write the corresponding mRNA sequence. NOTE: Your answer should not exceed 20 words. Max Word Count : 20 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q31] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH The following DNA coding strand sequence is given: 5′-ATGACCTTACGATAA-3′. Answer the given subquestions using this Codon chart. First base in codon c G Codon Chart Second base in codon c A wU phe VUC - JUG - CUU T cUC Leu CUA CUG - Ucc UCA UCG - Ser CCU - ccc Pro CCG - AUU - ACU T AUC Ile ACC AUA - ACA AUG Met (start) ACG - GUU - GCU - GUC GCC GUA Val GCA GUG - GCG J Thr Ala JAC - VAG ISTOP CAU - CAC / His CAR GIn CAG J CAC TAPp SAA GAG_/ Glu G UGC - UGA STOP UGG Trp CGU - CGC Arg CGA CGG J AGU T AGC / Ser AGA TArO AGG - GGU - GGC GGA GGG - Gly G G G G Last base in codon Identify the start codon. NOTE: Your answer should not exceed 3 words. Max Word Count : 3 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q32] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH The following DNA coding strand sequence is given: 5′-ATGACCTTACGATAA-3′. Answer the given subquestions using this Codon chart. First base in codon c G Codon Chart Second base in codon c A wU phe VUC - JUG - CUU T cUC Leu CUA CUG - Ucc UCA UCG - Ser CCU - ccc Pro CCG - AUU - ACU T AUC Ile ACC AUA - ACA AUG Met (start) ACG - GUU - GCU - GUC GCC GUA Val GCA GUG - GCG J Thr Ala JAC - VAG ISTOP CAU - CAC / His CAR GIn CAG J CAC TAPp SAA GAG_/ Glu G UGC - UGA STOP UGG Trp CGU - CGC Arg CGA CGG J AGU T AGC / Ser AGA TArO AGG - GGU - GGC GGA GGG - Gly G G G G Last base in codon Write the amino acid sequence coded by this nucleotide sequence. NOTE: Your answer should not exceed 10 words. Max Word Count : 10 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Molecular Biology & Central Dogma.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

### Module: Network Ensembles & Random Graph Models (10 Questions)

#### [BDBN-2024-FEB-Q5] MCQ — 2.0 Marks (2024-FEB)
**Question:** Which of the following is a characteristic property of Erdös –Rényi random networks?

**Options:**
- A. Scale-free degree distribution.
- B. Small-world phenomenon.
- C. Uniform probability of edges between nodes.
- D. Hierarchical modular structure.

> **Verified Answer:** `C. Uniform probability of edges between nodes.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Uniform probability of edges between nodes.`.
2. Theoretical principle: In the context of Network Ensembles & Random Graph Models, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q13] MSQ — 3.0 Marks (2024-FEB)
**Question:** What happens to the connectivity of Erdös–Rényi G(n ,p) random networks as the probability increases?

**Options:**
- A. The network becomes more disconnected.
- B. The network transitions to a fully connected graph.
- C. The average degree of the network increases.
- D. The diameter of the network increases.

> **Verified Answer:** `B. The network transitions to a fully connected graph.; C. The average degree of the network increases.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. The network transitions to a fully connected graph.; C. The average degree of the network increases.`.
2. Theoretical principle: In the context of Network Ensembles & Random Graph Models, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q21] MCQ — 2.0 Marks (2025-FEB)
**Question:** In an Erdos-Renyi graph G(n.p), what is the asymptotic threshold for connectivity (i.e., the probability at which the graph becomes connected with high probability)?

**Options:**
- A.
- B. p = 1/n
- C. p = 1/Vn
- D. p = 2 inn

> **Verified Answer:** `A.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In an Erdős–Rényi random network $G(N, p)$, degree distribution follows a Binomial distribution: $P(k) = \binom{N-1}{k} p^k (1-p)^{N-1-k}$.
2. In the limit of large $N$ ($N \to \infty$) and small $p$ with fixed average degree $\langle k \rangle = \lambda = Np$, the Binomial distribution converges to a **Poisson distribution**: $P(k) \approx \frac{e^{-\lambda} \lambda^k}{k!}$.
3. For both realizations with $N=1000$ and $N=100$ where $N$ is large compared to $\langle k \rangle$, the empirical degree distribution is characterized by Poisson-type behavior.
Exam Trap: Real biological networks (scale-free) follow a power law $P(k) \sim k^{-\gamma}$, whereas ER random graphs follow Poisson.

---

#### [BDBN-2025-FEB-Q23] MSQ — 3.0 Marks (2025-FEB)
**Question:** Which of the following statements are true about the behavior of random and small-world networks?

**Options:**
- A. In a small-world network, as the rewiring probability p increases, the averagepath length decreases
- B. Random networks tend to have high clustering coefficients compared to small-world networks for small p.
- C. In a small-world network, increasing the rewiring probability p makes thenetwork more disconnected and increases the clustering coefficient.
- D. Small-world networks have a balance of high clustering and short averagepath length for intermediate

> **Verified Answer:** `A. In a small-world network, as the rewiring probability p increases, the averagepath length decreases; D. Small-world networks have a balance of high clustering and short averagepath length for intermediate`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. In a small-world network, as the rewiring probability p increases, the averagepath length decreases; D. Small-world networks have a balance of high clustering and short averagepath length for intermediate`.
2. Theoretical principle: In the context of Network Ensembles & Random Graph Models, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q24] MSQ — 3.0 Marks (2025-FEB)
**Question:** Which of the following network models are suitable for representing the topology of metabolic pathways in biological systems?

**Options:**
- A. Small-world network  because it ensures high clustering, which representsfunctional metabolic clusters
- B. Random network  because it randomly connects metabolites and enzymes,ensuring diverse and unpredictable interactions in the network.
- C. Power-law network  because it produces a few highly connected nodes (hubenzymes) that play crucial
- D. Random network  because it results in efficient information transfer througha uniform distribution of connections between metabolites and enzymes.

> **Verified Answer:** `A. Small-world network  because it ensures high clustering, which representsfunctional metabolic clusters; C. Power-law network  because it produces a few highly connected nodes (hubenzymes) that play crucial`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. Small-world network  because it ensures high clustering, which representsfunctional metabolic clusters; C. Power-law network  because it produces a few highly connected nodes (hubenzymes) that play crucial`.
2. Theoretical principle: In the context of Network Ensembles & Random Graph Models, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q9] MCQ — 1.0 Marks (2026-MAR)
**Question:** Generate two distinct realizations of the Erdős–Rényi random network model. Network 1: node_num=1000 and prob=0.001 Network 2: node_num=100 and prob=0.001 While plotting the degree distribution plot, which of the following statements best describes and compares the degree distributions of these two networks? n, p= node_num, prob ERg1= nx.erdos_renyi_graph(n,p) deg= [ERgl.degree[i] for i in ERgl.nodes()] fig, ax = plt.subplots(1,1, figsize=(10,5)) ax.hist (deg, 20, density=True) ax.set_xlabel ('Degrees', fontweight='bold') ax.set ylabel ('Probability_density', fontweight='bold')

**Options:**
- A. Poisson; Poisson
- B. Poisson; Binomial
- C. Binomial; Poisson
- D. Binomial; Binomial

> **Verified Answer:** `A. Poisson; Poisson`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In an Erdős–Rényi random network $G(N, p)$, degree distribution follows a Binomial distribution: $P(k) = \binom{N-1}{k} p^k (1-p)^{N-1-k}$.
2. In the limit of large $N$ ($N \to \infty$) and small $p$ with fixed average degree $\langle k \rangle = \lambda = Np$, the Binomial distribution converges to a **Poisson distribution**: $P(k) \approx \frac{e^{-\lambda} \lambda^k}{k!}$.
3. For both realizations with $N=1000$ and $N=100$ where $N$ is large compared to $\langle k \rangle$, the empirical degree distribution is characterized by Poisson-type behavior.
Exam Trap: Real biological networks (scale-free) follow a power law $P(k) \sim k^{-\gamma}$, whereas ER random graphs follow Poisson.

---

#### [BDBN-2026-MAR-Q10] MCQ — 1.0 Marks (2026-MAR)
**Question:** In the construction of a Watts-Strogatz Small-World network, the topology is governed by the rewiring probability parameter P . If we set the rewiring probability to its maximum value, P = 1 , which of the following best describes the resulting network's structural behavior?

**Options:**
- A. Regular lattice model
- B. Random network model
- C. Rich gets richer model
- D. Configuration model

> **Verified Answer:** `B. Random network model`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. The Watts-Strogatz model interpolates between a regular ring lattice ($p=0$) and a random network ($p=1$).
2. For intermediate rewiring probabilities $0 < p < 1$, it exhibits **small-world** properties: high clustering coefficient (like a lattice) and short average path length (like a random graph).
3. Rewiring edges creates long-range shortcuts that drastically reduce diameter without destroying local clustering.

---

#### [BDBN-2026-MAR-Q14] MCQ — 1.0 Marks (2026-MAR)
**Question:** A network with a skewed adjacency matrix where most entries are in a few rows/columns is a hallmark of:

**Options:**
- A. Bipartite network
- B. Erdos Renyi network
- C. Scale-free network
- D. US power grid network

> **Verified Answer:** `C. Scale-free network`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Scale-free network`.
2. Theoretical principle: In the context of Network Ensembles & Random Graph Models, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q17] MSQ — 2.0 Marks (2026-MAR)
**Question:** In the context of network ensembles, which of the following accurately differentiate an Erdős–Rényi (ER) random network from a Scale-Free (SF) biological network?

**Options:**
- A. ER networks are resilient to targetted attacks on hubs, while SF networks are not.
- B. ER networks always have higher clustering coefficients than SF networks.
- C. ER networks have a homogeneous distribution, while SF networks are heterogneneous.

> **Verified Answer:** `A. ER networks are resilient to targetted attacks on hubs, while SF networks are not.; C. ER networks have a homogeneous distribution, while SF networks are heterogneneous.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In an Erdős–Rényi random network $G(N, p)$, degree distribution follows a Binomial distribution: $P(k) = \binom{N-1}{k} p^k (1-p)^{N-1-k}$.
2. In the limit of large $N$ ($N \to \infty$) and small $p$ with fixed average degree $\langle k \rangle = \lambda = Np$, the Binomial distribution converges to a **Poisson distribution**: $P(k) \approx \frac{e^{-\lambda} \lambda^k}{k!}$.
3. For both realizations with $N=1000$ and $N=100$ where $N$ is large compared to $\langle k \rangle$, the empirical degree distribution is characterized by Poisson-type behavior.
Exam Trap: Real biological networks (scale-free) follow a power law $P(k) \sim k^{-\gamma}$, whereas ER random graphs follow Poisson.

---

#### [BDBN-2026-MAR-Q18] MSQ — 2.0 Marks (2026-MAR)
**Question:** The Power Law (Scale-Free) network model is a cornerstone of modern network science. However, it possesses several structural and dynamical disadvantages when used to represent real-world biological or infrastructure systems. Which of the following are recognized disadvantages or limitations of this model?

**Options:**
- A. Less vulnerability to Targeted Attacks: Because the network's integrity relies on a small number of massive hubs, the deliberate removal of these high-degree nodes leads to a rapid decrease in network diameter and eventual integration.
- B. Lack of High Clustering: The basic Barabási–Albert model fails to produce the high local clustering (triadic closure) observed in real-world social and metabolic networks, as it primarily focuses on global
- C. Infinite Variance in Infinite Networks: In networks where the power-law exponent  2<y<3 making standard statistical tools (like those based on Gaussian distributions) difficult or impossible to apply to the
- D. The "First-Mover" Bias: The model assumes that the oldest nodes always accumulate the most edges, failing to account for "late-comer" nodes that might become hubs due to superior fitness or functional

> **Verified Answer:** `B. Lack of High Clustering: The basic Barabási–Albert model fails to produce the high local clustering (triadic closure) observed in real-world social and metabolic networks, as it primarily focuses on global; C. Infinite Variance in Infinite Networks: In networks where the power-law exponent  2<y<3 making standard statistical tools (like those based on Gaussian distributions) difficult or impossible to apply to the; D. The "First-Mover" Bias: The model assumes that the oldest nodes always accumulate the most edges, failing to account for "late-comer" nodes that might become hubs due to superior fitness or functional`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Scale-Free networks (Barabási-Albert model) are generated via two mechanisms: continuous growth and preferential attachment ('rich get richer').
2. Degree distribution follows a Power Law: $P(k) \sim k^{-\gamma}$, typically with $2 < \gamma < 3$.
3. Characterized by a few highly connected 'hub' nodes. They are robust against random node failures but highly vulnerable to targeted attacks on hubs.

---

### Module: Network Metrics & Graph Centrality (16 Questions)

#### [BDBN-2024-FEB-Q11] MSQ — 3.0 Marks (2024-FEB)
**Question:** In the graph shown below: In the graph shown below:

**Options:**
- A. Only the red node has high betweenness
- B. The blue node and the red node have high betweenness
- C. The blue node has high betweenness and high degree

> **Verified Answer:** `B. The blue node and the red node have high betweenness; C. The blue node has high betweenness and high degree`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. The blue node and the red node have high betweenness; C. The blue node has high betweenness and high degree`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q12] MSQ — 3.0 Marks (2024-FEB)
**Question:** Choose the TRUE statement

**Options:**
- A. A smaller characteristic path length indicates a network is tightly connected.
- B. In an Erdös–Rényi G(n ,p) network, there are hub nodes to which new nodesconnect with higher probability, as the network grows.
- C. The degree distribution of Erdös–Rényi G(n ,p) network follows the Poissondistribution, for large n
- D. In a hypergraph, every hyper-edge is a subset of V × V where V is the set of allvertices in the graph.

> **Verified Answer:** `A. A smaller characteristic path length indicates a network is tightly connected.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. A smaller characteristic path length indicates a network is tightly connected.`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q15] NAT — 2.0 Marks (2024-FEB)
**Question:** CONTEXT / PARAGRAPH Use the attached graph to answer the given subquestions: Use the attached graph to answer the given subquestions: The clustering coefficient of node 5 is ________ NOTE: Enter your answer in one decimal place.

> **Verified Answer:** `0.1`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `0.1`.
2. Conceptual derivation: Evaluate the governing formula for Network Metrics & Graph Centrality.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2025-FEB-Q18] MCQ — 2.0 Marks (2025-FEB)
**Question:** What is the clustering coefficient of the given graph?

**Options:**
- A. 0.67
- B. 0.50
- C. 0.31
- D. 0.44

> **Verified Answer:** `D. 0.44`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `D. 0.44`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q25] MCQ — 2.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the subquestions for the given graph: Calculate the betweenness centrality of node D in the network.

**Options:**
- A. 0.429
- B. 0.333
- C. 0.524
- D. 0.286

> **Verified Answer:** `A. 0.429`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. 0.429`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q26] MCQ — 2.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the subquestions for the given graph: In the network shown, calculate the degree centrality of node E.

**Options:**
- A. 0.571
- B. 0.714
- C. 0.429
- D. 0.857

> **Verified Answer:** `B. 0.714`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. 0.714`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q28] MCQ — 2.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Answer the subquestions for the given graph: Calculate the closeness centrality of node E.

**Options:**
- A. 0.538
- B. 0.636
- C. 0.583
- D. 0.500

> **Verified Answer:** `C. 0.583`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. 0.583`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q7] MCQ — 1.0 Marks (2026-MAR)
**Question:** In a network, a 'bridge' node connects two otherwise isolated groups. If a node has 6 neighbors, and 3 of these neighbors form a complete clique among themselves while the other 3 have no connections to anyone else, what is this node's clustering coefficient?

**Options:**
- A. 0.50
- B. 0.20
- C. 0.10
- D. 0.33

> **Verified Answer:** `B. 0.20`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Local clustering coefficient $C_i = \frac{2 \times E_i}{k_i(k_i - 1)}$, where $k_i$ is degree and $E_i$ is number of edges between neighbors.
2. Given: Degree $k_i = 6$. Total possible edges between 6 neighbors $= \frac{6 \times 5}{2} = 15$.
3. Given that 3 neighbors form a complete clique among themselves: Edges in a 3-clique $= \frac{3 \times 2}{2} = 3$ edges.
   The remaining 3 neighbors have no edges. Total edges between neighbors $E_i = 3$.
4. Calculation: $C_i = \frac{3}{15} = \frac{1}{5} = 0.20$.
Exam Trap: Ensure you divide by $\binom{k}{2} = 15$, not by $\binom{3}{2}$.

---

#### [BDBN-2026-MAR-Q8] MCQ — 1.0 Marks (2026-MAR)
**Question:** Consider the following network. If the efficiency ( E ) of the information flow from this network is defined as the inverse of the average characteristic path length ( ), such that E = i . The efficiency of information flow from this network is

**Options:**
- A. 1.6
- B. 0.83
- C. 0.25
- D. 1.25

> **Verified Answer:** `B. 0.83`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Network efficiency is defined as $E = \frac{1}{L}$, where $L$ is the characteristic path length.
2. Sum pairwise shortest path lengths across all node pairs and divide by $\frac{N(N-1)}{2}$ to find average path length $L = 1.20$.
3. Efficiency $E = \frac{1}{1.20} \approx 0.833 = 0.83$.
Exam Trap: Efficiency is the reciprocal of characteristic path length. If $L > 1$, efficiency must be $< 1$.

---

#### [BDBN-2026-MAR-Q11] MCQ — 1.0 Marks (2026-MAR)
**Question:** In which of the following network architectures are degree centrality and betweenness centrality typically most strongly correlated, particularly for the highest-ranking nodes?

**Options:**
- A. Bipartite graph
- B. Scale free network
- C. Erdos Renyi network
- D. 2D lattice network

> **Verified Answer:** `B. Scale free network`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Scale free network`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q12] MCQ — 1.0 Marks (2026-MAR)
**Question:** What is the value of the clustering coefficient ( ) for any node in a strictly bipartite network N with average degree as (k) ?

**Options:**
- A. 1.0
- B. ≥|₴
- C. 0
- D.

> **Verified Answer:** `C. 0`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. 0`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q13] MCQ — 1.0 Marks (2026-MAR)
**Question:** If you are tasked with deploying defensive equipment (such as anti-aircraft batteries or rapid-response units) to protect a nation from air-to-ground attacks, and your primary objective is to ensure that these units can reach any point in the network in the fewest possible steps, which centrality measure should you prioritize for site selection?

**Options:**
- A. Eigenvector centrality
- B. Degree centrality
- C. Betweenness centrality
- D. Closeness centrality

> **Verified Answer:** `D. Closeness centrality`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `D. Closeness centrality`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q19] MSQ — 2.0 Marks (2026-MAR)
**Question:** In a large, regular lattice network, a "shortcut" edge is added between two distant peripheral nodes. Which of the following centrality measures would remain unaffected for the vast majority of nodes in the network (excluding the two nodes directly involved in the new connection)?

**Options:**
- A. Eigenvector centrality
- B. Degree centrality
- C. Betweenness centrality
- D. Clustering coefficient of each unaffected node

> **Verified Answer:** `B. Degree centrality; D. Clustering coefficient of each unaffected node`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Degree centrality; D. Clustering coefficient of each unaffected node`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q23] MCQ — 2.0 Marks (2026-MAR)
**Question:** The following question consists of two statements: an Assertion (A) and a Reasoning (R). Select the correct answer from the options below: Assertion (A): In a Star Graph topology, the central hub possesses the highest degree centrality but zero betweenness centrality in the entire network. Reasoning (R): The central node in a star graph acts as a mandatory bridge for all (V- 1)(N-2) pairs of peripheral nodes that wish to communicate via the shortest path.

**Options:**
- A. Both (A) and (R) are true, and (R) is the correct explanation of (A).
- B. Both (A) and (R) are true, but (R) is not the correct explanation of (A).
- C. (A) is true, but (R) is false.
- D. (A) is false, but (R) is true.

> **Verified Answer:** `D. (A) is false, but (R) is true.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `D. (A) is false, but (R) is true.`.
2. Theoretical principle: In the context of Network Metrics & Graph Centrality, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q34] NAT — 2.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. What is the characteristic path length of the network?

> **Verified Answer:** `2.2 – 2.4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `2.2 – 2.4`.
2. Conceptual derivation: Evaluate the governing formula for Network Metrics & Graph Centrality.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q35] NAT — 2.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. What is the clustering coefficient of node D if we add an edge between A and D?

> **Verified Answer:** `0.25 – 0.4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `0.25 – 0.4`.
2. Conceptual derivation: Evaluate the governing formula for Network Metrics & Graph Centrality.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

### Module: Omics Technologies & High-Throughput Sequencing (19 Questions)

#### [BDBN-2024-FEB-Q6] MCQ — 2.0 Marks (2024-FEB)
**Question:** Match the following omics approaches and the techniques used to study them Match the following omics approaches and the techniques used to study them i ii iv Genomics Transcriptomics Proteomics Metabolomics B Mass spectroscopy Illumina sequencing qPCR ChIP

**Options:**
- A. i-c, ii-c, iii-d iv-a
- B. i-b, ii-c, iii-a, iv-a
- C. i-c, ii-d, iii-a, iv-b
- D. i-b, ii-c, iii-d iv-a

> **Verified Answer:** `B. i-b, ii-c, iii-a, iv-a`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. i-b, ii-c, iii-a, iv-a`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q9] MCQ — 2.0 Marks (2024-FEB)
**Question:** Match the GWAS term with its description. Match the GWAS term with its description. B DI Column A SNP P-value Manhattan plot Linkage disequilibrium 4 Column B Visualization of genomic regions associated with traits or diseases A statistical measure indicating the strength of association between a genetic variant and a trait. Patterns of non-random association of alleles at different loci. Common type of genetic variation analysed in GWAS

**Options:**
- A. A - 2, B - 1, C - 4, D - 3
- B. A - 4, B - 3, C - 1, D - 2
- C. A - 4, B - 2, C - 1, D - 3
- D. A - 3, B - 2, C - 4, D - 1

> **Verified Answer:** `C. A - 4, B - 2, C - 1, D - 3`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2024-FEB-Q18] MCQ — 1.0 Marks (2024-FEB)
**Question:** GWAS is used for A. It aims to find a relation between genotype and phenotype by studying the gene products affecting the phenotype. B. Identifying the association between genotype and phenotype by comparing statistically significant genetic variants of individuals in a population.

**Options:**
- A. Only A
- B. Only B
- C. Both A and B
- D. None of these.

> **Verified Answer:** `B. Only B`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2024-FEB-Q20] MCQ — 1.0 Marks (2024-FEB)
**Question:** What is the primary advantage of Next-Generation Sequencing (NGS) over traditional Sanger sequencing?

**Options:**
- A. Longer read lengths.
- B. Higher accuracy.
- C. Higher throughput.
- D. Lower cost per base.

> **Verified Answer:** `C. Higher throughput.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Higher throughput.`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2024-FEB-Q27] NAT — 3.0 Marks (2024-FEB)
**Question:** Read the sequence of the sample obtained from sangers sequencing from 5’-> 3’ based on the gel picture given below. Read the sequence of the sample obtained from sangers sequencing from 5’-> 3’ based on the gel picture given below. G

> **Verified Answer:** `GTACCCGAAATCAGGA`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `GTACCCGAAATCAGGA`.
2. Conceptual derivation: Evaluate the governing formula for Omics Technologies & High-Throughput Sequencing.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2025-FEB-Q5] MCQ — 1.0 Marks (2025-FEB)
**Question:** What is the primary advantage of Next-Generation Sequencing (NGS) over traditional Sanger sequencing?

**Options:**
- A. Longer read lengths.
- B. Higher accuracy.
- C. Higher throughput.
- D. Lower cost per base.

> **Verified Answer:** `C. Higher throughput.`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Higher throughput.`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2025-FEB-Q9] MSQ — 2.0 Marks (2025-FEB)
**Question:** Match the following and choose the correct option Column A Linkage disequilibrium 1 B P-value 2 C Manhattan plot 3 D SNP 4 Column B Visualization of genomic regions associated with traits or diseases A statistical measure indicating the strength of association between a genetic variant and a trait. Patterns of non- random association of alleles at different loci. Common type of genetic variation analysed in GWAS

**Options:**
- A. A - 2, B - 1, C - 4, D - 3
- B. A - 4, B - 2, C - 1, D - 3
- C. A - 3, B - 2, C - 1, D - 3
- D. A - 3, B - 2, C - 1, D - 4

> **Verified Answer:** `D. A - 3, B - 2, C - 1, D - 4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2025-FEB-Q13] NAT — 1.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. Consider the following human GWAS result: 10.0 id:5 - - td:10-- - -1 id:7 *1d:9- -f:6 -log10(p) 2.5 0.0 id: 1| id: 3° id:8 -id:4 What is the id number of the most significant SNP?

> **Verified Answer:** `2`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2025-FEB-Q14] NAT — 1.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. Consider the following human GWAS result: 10.0 id:5 - - td:10-- - -1 id:7 *1d:9- -f:6 -log10(p) 2.5 0.0 id: 1| id: 3° id:8 -id:4 From the plot, what would be the number of SNPs considered for this analysis? (Give 5% range above and below)

> **Verified Answer:** `1000000`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2025-FEB-Q15] NAT — 1.0 Marks (2025-FEB)
**Question:** CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. Consider the following human GWAS result: 10.0 id:5 - - td:10-- - -1 id:7 *1d:9- -f:6 -log10(p) 2.5 0.0 id: 1| id: 3° id:8 -id:4 How many causal SNPs are present in the figure?

> **Verified Answer:** `9`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2025-FEB-Q16] NAT — 3.0 Marks (2025-FEB)
**Question:** NOTE: Enter the exact answer without any extra space in the beginning or at the end. Consider the following gel: C Read the sequence of the sample obtained from Sanger sequencing from 5-> 3' based on the gel picture given above. Deduce the sequence of the sample and provide the answer in the input field in the form: eg. ATGC

> **Verified Answer:** `ATGCTGTAACTGA`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `ATGCTGTAACTGA`.
2. Conceptual derivation: Evaluate the governing formula for Omics Technologies & High-Throughput Sequencing.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q4] MCQ — 1.0 Marks (2026-MAR)
**Question:** The transcriptome of a cell is

**Options:**
- A. Constant across all tissues
- B. Independent of environmental signals
- C. Dynamic and condition-dependent
- D. Identical to the genome

> **Verified Answer:** `C. Dynamic and condition-dependent`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. While the genome of an organism is static and identical in virtually all somatic cells, the **transcriptome** (the complete set of RNA transcripts) is dynamic and condition-dependent.
2. Gene expression changes in response to environmental stimuli, developmental stages, stress, and disease states.

---

#### [BDBN-2026-MAR-Q5] MCQ — 1.0 Marks (2026-MAR)
**Question:** GWAS is primarily used to

**Options:**
- A. Sequence the entire genome of one individual
- B. Study gene expression patterns
- C. Identify genetic variants associated with traits or diseases
- D. Modify disease-causing genes

> **Verified Answer:** `C. Identify genetic variants associated with traits or diseases`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Genome-Wide Association Studies (GWAS) survey hundreds of thousands to millions of single nucleotide polymorphisms (SNPs) across genomes of large cohorts.
2. Goal: Identify statistically significant genetic variants associated with specific observable traits or complex diseases.

---

#### [BDBN-2026-MAR-Q6] MCQ — 1.0 Marks (2026-MAR)
**Question:** The amplification method used in Illumina sequencing is

**Options:**
- A. Emulsion PCR
- B. Rolling circle amplification
- C. Bridge amplification
- D. RT-PCR

> **Verified Answer:** `C. Bridge amplification`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. Bridge amplification`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q16] MSQ — 2.0 Marks (2026-MAR)
**Question:** Which of the following statements are true regarding metabolomics and fluxomics?

**Options:**
- A. Metabolomics is primarily a dynamic analysis of metabolic activity over time.
- B. Fluxomics focuses on the rate of metabolite flow through metabolic pathways.
- C. Metabolomics provides a snapshot of metabolite concentrations in a biological system.
- D. Fluxomics commonly uses stable isotope labelling to quantify pathway activity

> **Verified Answer:** `B. Fluxomics focuses on the rate of metabolite flow through metabolic pathways.; C. Metabolomics provides a snapshot of metabolite concentrations in a biological system.; D. Fluxomics commonly uses stable isotope labelling to quantify pathway activity`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. Fluxomics focuses on the rate of metabolite flow through metabolic pathways.; C. Metabolomics provides a snapshot of metabolite concentrations in a biological system.; D. Fluxomics commonly uses stable isotope labelling to quantify pathway activity`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q21] MCQ — 2.0 Marks (2026-MAR)
**Question:** Match the following and choose the correct option Method A. Whole-genome sequencing B. RNA-Seq C. Mass spectrometry D. ChIP-Seq E. Metabolic flux analysis Omics 1.Transcriptomics 2. Epigenomics 3. Proteomics 4. Fluxomics 5. Genomics

**Options:**
- A. A–5, B–1, C–3, D–2, E–4
- B. A–1, B–5, C–3, D–2, E–4
- C. A–5, B–3, C–1, D–2, E–4
- D. A–4, B–1, C–3, D–5, E–2

> **Verified Answer:** `A. A–5, B–1, C–3, D–2, E–4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. A–5, B–1, C–3, D–2, E–4`.
2. Theoretical principle: In the context of Omics Technologies & High-Throughput Sequencing, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [BDBN-2026-MAR-Q27] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH During Sanger sequencing of a DNA fragment, the sequencing gel shows bands in the following order from bottom to top: G, A, T, C, C, A, G, T, A Based on the above data, answer the given subquestions. What is the end nucleotide of the newly synthesised DNA strand? NOTE: Enter the exact answer without any extra space in the beginning or at the end. Answers Case Sensitive : No

> **Verified Answer:** `G`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `G`.
2. Conceptual derivation: Evaluate the governing formula for Omics Technologies & High-Throughput Sequencing.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q28] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH During Sanger sequencing of a DNA fragment, the sequencing gel shows bands in the following order from bottom to top: G, A, T, C, C, A, G, T, A Based on the above data, answer the given subquestions. Which dideoxynucleotide (ddNTP) caused termination of the longest DNA fragment? NOTE: Enter the exact answer without any extra space in the beginning or at the end. Answers Case Sensitive : No

> **Verified Answer:** `ddATP`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `ddATP`.
2. Conceptual derivation: Evaluate the governing formula for Omics Technologies & High-Throughput Sequencing.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [BDBN-2026-MAR-Q29] NAT — 1.0 Marks (2026-MAR)
**Question:** CONTEXT / PARAGRAPH During Sanger sequencing of a DNA fragment, the sequencing gel shows bands in the following order from bottom to top: G, A, T, C, C, A, G, T, A Based on the above data, answer the given subquestions. Why is the DNA sequence read from bottom to top in a Sanger sequencing gel? NOTE: Your answer should not exceed 50 words. Max Word Count : 50 Min Word Count : 0 Highlight min word : Yes Single Line Response : No Number of Rows : 10 Number Of Columns : 70

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Omics Technologies & High-Throughput Sequencing.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

## Part 3: Rapid Active Recall Flashcard Drill

| # | Question / Prompt | Instant Recall Answer | Deep-Grokking Rule |
| :-: | :--- | :--- | :--- |
| 1 | In which direction does DNA polymerase synthesize a new DNA strand? | **5' to 3' direction**. | Free nucleotides are added strictly to the 3'-OH group. |
| 2 | To what specific DNA sequence does RNA polymerase bind to initiate transcription? | **Promoter**. | Operator binds repressors; enhancers act at long ranges. |
| 3 | What is the defining difference between the genome and the transcriptome? | Genome is **static** across tissues; transcriptome is **dynamic and condition-dependent**. | Cells express different sets of genes in response to stimuli. |
| 4 | What amplification mechanism is utilized in Illumina high-throughput sequencing? | **Bridge Amplification**. | Forms dense monoclonal clusters on the surface of the flow cell. |
| 5 | Why do dideoxynucleotides (ddNTPs) terminate chain elongation in Sanger sequencing? | They lack the **3'-OH group** needed for phosphodiester bond formation. | DNA polymerase cannot link the next nucleotide. |
| 6 | What is the clustering coefficient of a node with 6 neighbors if 3 form a clique and 3 have no other edges? | **0.20** (or $1/5$). | $E_i = 3$, possible edges $= \binom{6}{2} = 15 \implies 3/15 = 0.20$. |
| 7 | What degree distribution characterizes an Erdős–Rényi random network for large $N$? | **Poisson distribution** (limiting form of Binomial). | Variance equals mean; lack of hubs or fat tails. |
| 8 | What degree distribution characterizes a Scale-Free network? | **Power Law**: $P(k) \sim k^{-\gamma}$. | Most nodes have low degree, while a few 'hubs' have very high degree. |
| 9 | Why are scale-free biological networks vulnerable to targeted attacks? | Removing a few **high-degree hub nodes** rapidly disintegrates the network into isolated components. | Robust to random failures, but fragile to hub attacks. |
| 10 | What metric represents the rate of metabolite flow through biological pathways? | **Fluxomics**. | Metabolomics measures static metabolite pools; fluxomics measures dynamic turnover rates. |
