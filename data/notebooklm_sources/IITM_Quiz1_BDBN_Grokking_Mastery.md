# 📘 IITM BS Degree: Big Data and Biological Networks (Quiz 1 Mastery)
> **Official IIT Madras BS in Data Science and Applications**  
> **Target Assessment:** Quiz 1 (Weeks 1 to 4)  
> **Compiled by:** Fabric OS Autonomous Academic Foundry  
> **Source Documents Analyzed:** 3 Official IITM Previous Year Question Papers (70 Unique Exam Questions)

---

## 🎯 Executive Grokking Overview & Syllabus Scope
Weeks 1 to 4: Central Dogma of Molecular Biology (DNA structure, double helix, replication, transcription, translation, codons), Chemical Bonds in Biomolecules (phosphodiester, peptide, glycosidic, hydrogen), Biological Databases & Sequence Formats (FASTA, GenBank, UniProt, PDB), Graph Theory Fundamentals for Biological Networks (Adjacency matrices, Degrees, Directed vs Undirected, Bipartite graphs), Network Topologies & Metrics (Density, Path lengths, Diameter, Clustering coefficient, Degree distribution, Centrality measures: Degree, Betweenness, Closeness, Eigenvector).

---

## 📐 Module I: Master Formula Sheet & Mathematical Invariants
Every key formula required for Quiz 1 numerical calculations:

$$
\text{Network Density (Undirected)}: D = \frac{2E}{N(N-1)} \quad (0 \le D \le 1)
$$

$$
\text{Network Density (Directed)}: D = \frac{E}{N(N-1)}
$$

$$
\text{Average Node Degree (Undirected)}: \langle k \rangle = \frac{2E}{N}
$$

$$
\text{Clustering Coefficient of node } i: C_i = \frac{2 e_i}{k_i(k_i - 1)} \quad \text{where } e_i \text{ is edges between neighbors of } i
$$

$$
\text{Average Clustering Coefficient}: \bar{C} = \frac{1}{N} \sum_{i=1}^N C_i
$$

$$
\text{Betweenness Centrality}: C_B(v) = \sum_{s \ne v \ne t} \frac{\sigma_{st}(v)}{\sigma_{st}}
$$

$$
\text{Closeness Centrality}: C_C(v) = \frac{N - 1}{\sum_{u \ne v} d(v, u)}
$$

$$
\text{Central Dogma Directionality}: \text{DNA Synthesis: } 5\' \to 3\', \quad \text{RNA Transcription: } 5\' \to 3\' \text{ from } 3\' \to 5\' \text{ template}
$$

---

## ⚠️ Module II: Critical Pitfalls & Recurring IITM Traps
The specific conceptual traps IIT Madras examiners set to catch unprepared students:

- **Trap:** Directionality in Molecular Biology: DNA/RNA polymerase ALWAYS synthesizes new strands in the $5' 	o 3'$ direction. It reads the template strand in the $3' 	o 5'$ direction.
- **Trap:** Bond types: Phosphodiester bonds link 3'-carbon of one sugar to 5'-carbon of next via phosphate; Peptide bonds link amino acids in proteins; Glycosidic bonds link nitrogenous base to ribose/deoxyribose sugar; Hydrogen bonds hold double-stranded DNA base pairs together (A=T 2 H-bonds, G≡C 3 H-bonds).
- **Trap:** Clustering coefficient calculation: A node with degree $k_i < 2$ has an undefined or zero clustering coefficient. Always divide by $k_i(k_i - 1)/2$, which is the maximum possible edges among its neighbors.
- **Trap:** Betweenness vs Closeness: Betweenness measures how often a node acts as a bridge on shortest paths; Closeness measures how close a node is to all other nodes in the network.


---

## 📝 Module III: Solved Previous Year Question Bank (70 Master Problems)
Every unique problem extracted from actual IITM Quiz 1 exam papers with verified correct answers and step-by-step reasoning:

### Problem 1 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> The density of the network given below is The density of the network given below is

**Options:**
- [x] **A. 0.7** *(Verified Correct Answer)*
- [ ] B. 0.28
- [ ] C. 1.4
- [ ] D. 1.2

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. 0.7**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 2 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Consider a bipartite graph with two node sets, A and B. Set A contains 5 nodes, and Set B con-tains 7 nodes. If the graph has a total of 23 edges, the average degree of the bipartite graph is

**Options:**
- [ ] A. 2.7
- [ ] B. 1.91
- [x] **C. 3.83** *(Verified Correct Answer)*
- [ ] D. 3.2

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 3.83**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 3 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Using the following code to answer the question below Using the following code to answer the question below What output will be printed by the code?

**Options:**
- [ ] A. [0, 1, 1, 1, 0, 0]
- [ ] B. [0, 1, 0, 0, 1, 0]
- [x] **C. [2, 3, 4]** *(Verified Correct Answer)*
- [ ] D. [1,2, 3, 4]

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. [2, 3, 4]**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 4 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Which of the following is a characteristic property of Erdös –Rényi random networks?

**Options:**
- [ ] A. Scale-free degree distribution.
- [ ] B. Small-world phenomenon.
- [x] **C. Uniform probability of edges between nodes.** *(Verified Correct Answer)*
- [ ] D. Hierarchical modular structure.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Uniform probability of edges between nodes.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 5 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Match the following omics approaches and the techniques used to study them Match the following omics approaches and the techniques used to study them

**Options:**
- [ ] A. i-c, ii-c, iii-d iv-a
- [x] **B. i-b, ii-c, iii-a, iv-a** *(Verified Correct Answer)*
- [ ] C. i-c, ii-d, iii-a, iv-b
- [ ] D. i-b, ii-c, iii-d iv-a

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. i-b, ii-c, iii-a, iv-a**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 6 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Assertion: RNA polymerase II is responsible for transcribing protein-coding genes in eukaryotic cells. Reason: RNA polymerase II recognizes and binds to the promoter regions of protein-coding genes, initiating the transcription process.

**Options:**
- [ ] A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion. ✓
- [ ] Correct
- [ ] B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion.
- [ ] C. The assertion is correct, but the reason is incorrect.
- [ ] D. The assertion is incorrect, but the reason is correct.

**Grokking Breakdown & First-Principles Solution:**
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 7 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Assertion: The binding of RNA polymerase to the promoter region is a crucial step in transcription. Reason: The promoter region consists of sequences that is recognised by the RNA polymerase.

**Options:**
- [ ] A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion.
- [ ] B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion. ✓
- [ ] Correct
- [ ] C. The assertion is correct, but the reason is incorrect.

**Grokking Breakdown & First-Principles Solution:**
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 8 [MCQ • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Match the GWAS term with its description. Match the GWAS term with its description.

**Options:**
- [ ] A. A - 2, B - 1, C - 4, D - 3
- [ ] B. A - 4, B - 3, C - 1, D - 2
- [x] **C. A - 4, B - 2, C - 1, D - 3** *(Verified Correct Answer)*
- [ ] D. A - 3, B - 2, C - 4, D - 1

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. A - 4, B - 2, C - 1, D - 3**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 9 [MSQ • 3.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Choose the bipartite graphs from the options representing various graphs, shown below:

**Options:**
- [ ] A.
- [x] **** *(Verified Correct Answer)*
- [ ] B.
- [x] **** *(Verified Correct Answer)*
- [ ] C.
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **, **.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 10 [MSQ • 3.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> In the graph shown below: In the graph shown below:

**Options:**
- [ ] A. Only the red node has high betweenness
- [x] **B. The blue node and the red node have high betweenness** *(Verified Correct Answer)*
- [x] **C. The blue node has high betweenness and high degree** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. The blue node and the red node have high betweenness, C. The blue node has high betweenness and high degree**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 11 [MSQ • 3.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Choose the TRUE statement

**Options:**
- [x] **A. A smaller characteristic path length indicates a network is tightly connected.** *(Verified Correct Answer)*
- [ ] B. In an Erdös–Rényi G(n ,p) network, there are hub nodes to which new nodesconnect with higher
- [ ] probability, as the network grows.
- [ ] C. The degree distribution of Erdös–Rényi G(n ,p) network follows the Poissondistribution, for large n ✓
- [ ] Correct
- [ ] D. In a hypergraph, every hyper-edge is a subset of V × V where V is the set of allvertices in the graph.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. A smaller characteristic path length indicates a network is tightly connected.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 12 [MSQ • 3.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> What happens to the connectivity of Erdös–Rényi G(n ,p) random networks as the probability increases?

**Options:**
- [ ] A. The network becomes more disconnected.
- [x] **B. The network transitions to a fully connected graph.** *(Verified Correct Answer)*
- [x] **C. The average degree of the network increases.** *(Verified Correct Answer)*
- [ ] D. The diameter of the network increases.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. The network transitions to a fully connected graph., C. The average degree of the network increases.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 13 [NAT/SA • 2.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Use the attached graph to answer the given subquestions: Use the attached graph to answer the given subquestions: The diameter of the given network is ____

**Numerical / Short Answer:** `4 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **4 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 14 [MCQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> What is the role of topoisomerase in DNA replication

**Options:**
- [ ] A. Synthesis of a new DNA strand from 5’->3’ using the parental strand as atemplate.
- [x] **B. Relieving of DNA supercoiling by formed dues to unwinding of the twostrands.** *(Verified Correct Answer)*
- [ ] C. Prevents annealing of the parental strands.
- [ ] D. None of these.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Relieving of DNA supercoiling by formed dues to unwinding of the twostrands.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 15 [MCQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> GWAS is used for A. It aims to find a relation between genotype and phenotype by studying the gene products affecting the phenotype. B. Identifying the association between genotype and phenotype by comparing statistically significant genetic variants of individuals in a population.

**Options:**
- [ ] A. Only A
- [x] **B. Only B** *(Verified Correct Answer)*
- [ ] C. Both A and B
- [ ] D. None of these.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Only B**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 16 [MCQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> What is the primary focus of transcriptomics?

**Options:**
- [ ] A. Study of protein structures.
- [ ] B. Examination of DNA sequences.
- [x] **C. Analysis of gene expression at the RNA level.** *(Verified Correct Answer)*
- [ ] D. Investigation of cell morphology.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Analysis of gene expression at the RNA level.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 17 [MCQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> What is the primary advantage of Next-Generation Sequencing (NGS) over traditional Sanger sequencing?

**Options:**
- [ ] A. Longer read lengths.
- [ ] B. Higher accuracy.
- [x] **C. Higher throughput.** *(Verified Correct Answer)*
- [ ] D. Lower cost per base.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Higher throughput.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 18 [MCQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Which of the following represents the start codon in mRNA that initiates translation?

**Options:**
- [x] **A. AUG** *(Verified Correct Answer)*
- [ ] B. UGA
- [ ] C. UAA
- [ ] D. CCC

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. AUG**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 19 [MSQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Which of the following is/are correct regarding DNA replication

**Options:**
- [x] **A. DNA Replication occurs from 5’-> 3’ end.** *(Verified Correct Answer)*
- [x] **B. The leading strand is synthesised in a continuous manner.** *(Verified Correct Answer)*
- [x] **C. DNA polymerase cannot initiate DNA replication.** *(Verified Correct Answer)*
- [ ] D. The lagging strand is synthesised in a continuous manner.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. DNA Replication occurs from 5’-> 3’ end., B. The leading strand is synthesised in a continuous manner., C. DNA polymerase cannot initiate DNA replication.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 20 [MSQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Which of the following is/are true regarding RNA

**Options:**
- [x] **A. RNA has Uracil instead of Thymine** *(Verified Correct Answer)*
- [ ] B. RNA has a deoxyribose sugar backbone.
- [ ] C. tRNA is translated to protein
- [ ] D. RNA is more stable than DNA

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. RNA has Uracil instead of Thymine**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 21 [MSQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Select the correct statements about stop codons.

**Options:**
- [ ] A. Stop codons signal the beginning of translation.
- [x] **B. There are three different stop codons in the standard genetic code.** *(Verified Correct Answer)*
- [x] **C. Stop codons do not specify any amino acid.** *(Verified Correct Answer)*
- [x] **D. Mutations converting a stop codon into a start codon can result in normalprotein synthesis.** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. There are three different stop codons in the standard genetic code., C. Stop codons do not specify any amino acid., D. Mutations converting a stop codon into a start codon can result in normalprotein synthesis.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 22 [MSQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Application of genomics include

**Options:**
- [x] **A. Studying evolutionary patterns across different strains and species.** *(Verified Correct Answer)*
- [ ] B. Identifying the gene expression patterns in cells.
- [ ] C. Studying post translational modifications.
- [x] **D. Identify genetic associations to phenotypic traits.** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. Studying evolutionary patterns across different strains and species., D. Identify genetic associations to phenotypic traits.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 23 [MSQ • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Which of the following statements accurately describe the goals of the 1000 Genomes Project?

**Options:**
- [ ] A. To study the gene expression patterns amongst different individuals
- [x] **B. To catalogue the genetic variations in human populations from different ethnicgroups.** *(Verified Correct Answer)*
- [x] **C. To identify common and rare variants that affect various phenotypes in humangenome.** *(Verified Correct Answer)*
- [x] **D. To provide a comprehensive resource for understanding human geneticdiversity** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. To catalogue the genetic variations in human populations from different ethnicgroups., C. To identify common and rare variants that affect various phenotypes in humangenome., D. To provide a comprehensive resource for understanding human geneticdiversity**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 24 [NAT/SA • 3.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> Read the sequence of the sample obtained from sangers sequencing from 5’-> 3’ based on the gel picture given below. Read the sequence of the sample obtained from sangers sequencing from 5’-> 3’ based on the gel picture given below.

**Numerical / Short Answer:** `GTACCCGAAATCAGGA (Equal • Alphanumeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **GTACCCGAAATCAGGA (Equal • Alphanumeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 25 [NAT/SA • 1.00 Marks]
**Source:** `2024_feb25_iit_m_an4_exam_qdb4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Answer the given subquestions from the plot. Answer the given subquestions from the plot. What is the name of the plot?

**Numerical / Short Answer:** `Manhattan plot (Equal • Alphanumeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **Manhattan plot (Equal • Alphanumeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 26 [MCQ • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> The bond between a phosphate group and the ribose sugar group in RNA is called which of the following?

**Options:**
- [ ] A. Peptide bond
- [ ] B. Glycosidic bond
- [x] **C. Phosphodiester bond** *(Verified Correct Answer)*
- [ ] D. Amide bond

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Phosphodiester bond**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 27 [MCQ • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Translation is the process by which:

**Options:**
- [ ] A. DNA gets converted to chromosomes
- [x] **B. RNA gets converted to protein** *(Verified Correct Answer)*
- [ ] C. Protein folding occurs to produce functional enzymes
- [ ] D. Cells produce ATP

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. RNA gets converted to protein**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 28 [MCQ • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following is not true :

**Options:**
- [ ] A. Genomics data is independent of the cell type
- [ ] B. Transcriptomics data is dependent on a specific cell type
- [ ] C. Both genomics data is independent of the cell type and transcriptomics data isdependent on a specific cell
- [ ] type are true
- [x] **D. None of these statements are true** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. None of these statements are true**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 29 [MCQ • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> What do the term Okazaki fragments refer to?

**Options:**
- [ ] A. Short fragments of DNA created before transcription
- [ ] B. Byproducts of histone modifications
- [ ] C. Short fragments of DNA created during replication on the 5’ to 3’ templatestrand
- [x] **D. Short fragments of DNA created during replication on the 3’ to 5’ templatestrand** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. Short fragments of DNA created during replication on the 3’ to 5’ templatestrand**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 30 [MCQ • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following proteins is required for transcription:

**Options:**
- [ ] A. DNA polymerase
- [x] **B. Sigma factor** *(Verified Correct Answer)*
- [ ] C. Uracilase

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Sigma factor**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 31 [MSQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following experiments fall under the purview of epigenomics?

**Options:**
- [x] **A. DNA methylation** *(Verified Correct Answer)*
- [x] **B. Chromatin accessibility** *(Verified Correct Answer)*
- [ ] C. Genome wide association studies
- [ ] D. Differential expression analysis

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. DNA methylation, B. Chromatin accessibility**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 32 [MSQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Refer to problem options and diagram.

**Options:**
- [ ] A. A - 2, B - 1, C - 4, D - 3
- [ ] B. A - 4, B - 2, C - 1, D - 3
- [ ] C. A - 3, B - 2, C - 1, D - 3
- [x] **D. A - 3, B - 2, C - 1, D - 4** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. A - 3, B - 2, C - 1, D - 4**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 33 [MSQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Consider the following and select the correct option. Assertion : Genomics can be used to identify individuals predisposed to certain diseases. Reason : By analyzing an individual's DNA, specific genetic variations associated with increased disease risk can be detected.

**Options:**
- [ ] A. Both the assertion and reason are correct, and the reason is a correctexplanation of the assertion. ✓
- [ ] Correct
- [ ] B. Both the assertion and reason are correct, but the reason is not a correctexplanation of the assertion.
- [ ] C. The assertion is correct, but the reason is incorrect.
- [ ] D. The assertion is incorrect, but the reason is correct.

**Grokking Breakdown & First-Principles Solution:**
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 34 [MSQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following statements are true:

**Options:**
- [ ] A. Transcription uses two strands of DNA
- [x] **B. Polyadenylation does not happen in prokaryotic cells** *(Verified Correct Answer)*
- [x] **C. Intronic genes are only present in eukaryotic cells** *(Verified Correct Answer)*
- [ ] D. Proteins are produced in the nuclei

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Polyadenylation does not happen in prokaryotic cells, C. Intronic genes are only present in eukaryotic cells**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 35 [MSQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Application of genomics include:

**Options:**
- [x] **A. Identifying individuals based on DNA evidence** *(Verified Correct Answer)*
- [ ] B. Tracking the spread of infectious diseases
- [x] **C. Predictive testing for genetic diseases** *(Verified Correct Answer)*
- [x] **D. Identifying genetic diversity within species** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. Identifying individuals based on DNA evidence, C. Predictive testing for genetic diseases, D. Identifying genetic diversity within species**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 36 [NAT/SA • 1.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. What is the id number of the most significant SNP?

**Numerical / Short Answer:** `2 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **2 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 37 [NAT/SA • 3.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> NOTE:  Enter the exact answer without any extra space in the beginning or at the end.

**Numerical / Short Answer:** `ATGCTGTAACTGA (Equal • Alphanumeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **ATGCTGTAACTGA (Equal • Alphanumeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 38 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> What is the clustering coefficient of the given graph?

**Options:**
- [ ] A. 0.67
- [ ] B. 0.50
- [ ] C. 0.31
- [x] **D. 0.44** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. 0.44**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 39 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> What is the mean degree of this undirected graph?

**Options:**
- [ ] A. 1/3
- [ ] B. 4/3
- [x] **C. 8/3** *(Verified Correct Answer)*
- [ ] D. 2/3

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 8/3**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 40 [MSQ • 3.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following statements about bipartite graphs is TRUE?

**Options:**
- [ ] A. In a bipartite graph, there are two disjoint sets of vertices such that no twovertices within the same set are
- [x] **adjacent.** *(Verified Correct Answer)*
- [ ] B. Every complete bipartite graph has an Eulerian circuit.
- [ ] C. A bipartite graph can be colored with two colors such that no two adjacentnodes have the same color. ✓
- [ ] Correct
- [ ] D. In the adjacency matrix of a bipartite graph, the values corresponding toedges within the same set of
- [ ] nodes will not all be zero.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **adjacent.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 41 [MSQ • 3.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following statements are true about the behavior of random and small-world networks?

**Options:**
- [ ] A. In a small-world network, as the rewiring probability p increases, the averagepath length decreases
- [x] **dramatically.** *(Verified Correct Answer)*
- [ ] B. Random networks tend to have high clustering coefficients compared to small-world networks for small p.
- [ ] C. In a small-world network, increasing the rewiring probability p makes thenetwork more disconnected and
- [ ] increases the clustering coefficient.
- [ ] D. Small-world networks have a balance of high clustering and short averagepath length for intermediate
- [x] **values of rewiring probability p.** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **dramatically., values of rewiring probability p.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 42 [MSQ • 3.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> Which of the following network models are suitable for representing the topology of metabolic pathways in biological systems?

**Options:**
- [ ] A. Small-world network  because it ensures high clustering, which representsfunctional metabolic clusters
- [x] **and pathways, while also having short path lengths for efficient chemical signaling.** *(Verified Correct Answer)*
- [ ] B. Random network  because it randomly connects metabolites and enzymes,ensuring diverse and
- [ ] unpredictable interactions in the network.
- [ ] C. Power-law network  because it produces a few highly connected nodes (hubenzymes) that play crucial
- [x] **roles in regulating key metabolic pathways.** *(Verified Correct Answer)*
- [ ] D. Random network  because it results in efficient information transfer througha uniform distribution of
- [ ] connections between metabolites and enzymes.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **and pathways, while also having short path lengths for efficient chemical signaling., roles in regulating key metabolic pathways.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 43 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Calculate the betweenness centrality of node D in the network.

**Options:**
- [x] **A. 0.429** *(Verified Correct Answer)*
- [ ] B. 0.333
- [ ] C. 0.524
- [ ] D. 0.286

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. 0.429**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 44 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH In the network shown, calculate the degree centrality of node E.

**Options:**
- [ ] A. 0.571
- [x] **B. 0.714** *(Verified Correct Answer)*
- [ ] C. 0.429
- [ ] D. 0.857

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 0.714**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 45 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH What is the density of this network?

**Options:**
- [x] **A. 0.464** *(Verified Correct Answer)*
- [ ] B. 0.393
- [ ] C. 0.500
- [ ] D. 0.429

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. 0.464**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 46 [MCQ • 2.00 Marks]
**Source:** `2025_feb23_iit_m_an_exam_qim4_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Calculate the closeness centrality of node E.

**Options:**
- [ ] A. 0.538
- [ ] B. 0.636
- [x] **C. 0.583** *(Verified Correct Answer)*
- [ ] D. 0.500
- [ ] This PDF was generated from quizpractice.space

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 0.583**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 47 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> DNA polymerase synthesises DNA in which direction?

**Options:**
- [ ] A.
- [ ] B.
- [x] **** *(Verified Correct Answer)*
- [ ] C.
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 48 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> RNA polymerase binds to a specific DNA sequence called

**Options:**
- [ ] A. Operator
- [ ] B. Terminator
- [x] **C. Promoter** *(Verified Correct Answer)*
- [ ] D. Enhancer

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Promoter**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 49 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The sequence of three nucleotides on mRNA that codes for an amino acid is called

**Options:**
- [ ] A. Anticodon
- [x] **B. Codon** *(Verified Correct Answer)*
- [ ] C. Exon
- [ ] D. Intron

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Codon**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 50 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The transcriptome of a cell is

**Options:**
- [ ] A. Constant across all tissues
- [ ] B. Independent of environmental signals
- [x] **C. Dynamic and condition-dependent** *(Verified Correct Answer)*
- [ ] D. Identical to the genome

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Dynamic and condition-dependent**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 51 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> GWAS is primarily used to

**Options:**
- [ ] A. Sequence the entire genome of one individual
- [ ] B. Study gene expression patterns
- [x] **C. Identify genetic variants associated with traits or diseases** *(Verified Correct Answer)*
- [ ] D. Modify disease-causing genes

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Identify genetic variants associated with traits or diseases**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 52 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The amplification method used in Illumina sequencing is

**Options:**
- [ ] A. Emulsion PCR
- [ ] B. Rolling circle amplification
- [x] **C. Bridge amplification** *(Verified Correct Answer)*
- [ ] D. RT-PCR

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Bridge amplification**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 53 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In a network, a 'bridge' node connects two otherwise isolated groups. If a node has 6 neighbors, and 3 of these neighbors form a complete clique among themselves while the other 3 have no connections to anyone else, what is this node's clustering coefficient?

**Options:**
- [ ] A. 0.50
- [x] **B. 0.20** *(Verified Correct Answer)*
- [ ] C. 0.10
- [ ] D. 0.33

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 0.20**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 54 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Consider the following network. If the efficiency ( ) of the information flow from this network is defined as the inverse of the average characteristic path length ( ), such that . The efficiency of information flow from this network is

**Options:**
- [ ] A. 1.6
- [x] **B. 0.83** *(Verified Correct Answer)*
- [ ] C. 0.25
- [ ] D. 1.25

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 0.83**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 55 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Generate two distinct realizations of the Erdős–Rényi random network model. Network 1: node_num=1000 and prob=0.001 Network 2: node_num=100 and prob=0.001 While plotting the degree distribution plot, which of the following statements best describes and compares the degree distributions of these two networks?

**Options:**
- [x] **A. Poisson; Poisson** *(Verified Correct Answer)*
- [ ] B. Poisson; Binomial
- [ ] C. Binomial; Poisson
- [ ] D. Binomial; Binomial

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. Poisson; Poisson**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 56 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In the construction of a Watts-Strogatz Small-World network, the topology is governed by the rewiring probability parameter . If we set the rewiring probability to its maximum value, , which of the following best describes the resulting network's structural behavior?

**Options:**
- [ ] A. Regular lattice model
- [x] **B. Random network model** *(Verified Correct Answer)*
- [ ] C. Rich gets richer model
- [ ] D. Configuration model

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Random network model**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 57 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In which of the following network architectures are degree centrality and betweenness centrality typically most strongly correlated, particularly for the highest-ranking nodes?

**Options:**
- [ ] A. Bipartite graph
- [x] **B. Scale free network** *(Verified Correct Answer)*
- [ ] C. Erdos Renyi network
- [ ] D. 2D lattice network

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Scale free network**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 58 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> What is the value of the clustering coefficient ( ) for any node in a strictly bipartite network N with average degree as ?

**Options:**
- [ ] A. 1.0
- [ ] B.
- [x] **C. 0** *(Verified Correct Answer)*
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 0**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 59 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> If you are tasked with deploying defensive equipment (such as anti-aircraft batteries or rapid-response units) to protect a nation from air-to-ground attacks, and your primary objective is to ensure that these units can reach any point in the network in the fewest possible steps, which centrality measure should you prioritize for site selection?

**Options:**
- [ ] A. Eigenvector centrality
- [ ] B. Degree centrality
- [ ] C. Betweenness centrality
- [x] **D. Closeness centrality** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. Closeness centrality**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 60 [MCQ • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A network with a skewed adjacency matrix where most entries are in a few rows/columns is a hallmark of:

**Options:**
- [ ] A. Bipartite network
- [ ] B. Erdos Renyi network
- [x] **C. Scale-free network** *(Verified Correct Answer)*
- [ ] D. US power grid network

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Scale-free network**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 61 [MSQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Transcription involves which of the following?

**Options:**
- [x] **A. DNA as a template** *(Verified Correct Answer)*
- [x] **B. RNA polymerase** *(Verified Correct Answer)*
- [ ] C. Ribosomes
- [x] **D. Ribonucleotides** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. DNA as a template, B. RNA polymerase, D. Ribonucleotides**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 62 [MSQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Which of the following statements are true regarding metabolomics and fluxomics?

**Options:**
- [ ] A. Metabolomics is primarily a dynamic analysis of metabolic activity over time.
- [x] **B. Fluxomics focuses on the rate of metabolite flow through metabolic pathways.** *(Verified Correct Answer)*
- [x] **C. Metabolomics provides a snapshot of metabolite concentrations in a biological system.** *(Verified Correct Answer)*
- [x] **D. Fluxomics commonly uses stable isotope labelling to quantify pathway activity** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Fluxomics focuses on the rate of metabolite flow through metabolic pathways., C. Metabolomics provides a snapshot of metabolite concentrations in a biological system., D. Fluxomics commonly uses stable isotope labelling to quantify pathway activity**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 63 [MSQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In the context of network ensembles, which of the following accurately differentiate an Erdős–Rényi (ER) random network from a Scale-Free (SF) biological network?

**Options:**
- [x] **A. ER networks are resilient to targetted attacks on hubs, while SF networks are not.** *(Verified Correct Answer)*
- [ ] B. ER networks always have higher clustering coefficients than SF networks.
- [x] **C. ER networks have a homogeneous distribution, while SF networks are heterogneneous.** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. ER networks are resilient to targetted attacks on hubs, while SF networks are not., C. ER networks have a homogeneous distribution, while SF networks are heterogneneous.**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 64 [MSQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The Power Law (Scale-Free) network model is a cornerstone of modern network science. However, it possesses several structural and dynamical disadvantages when used to represent real-world biological or infrastructure systems. Which of the following are recognized disadvantages or limitations of this model?

**Options:**
- [ ] A. Less vulnerability to Targeted Attacks: Because the network's integrity relies on a small number of
- [ ] massive hubs, the deliberate removal of these high-degree nodes leads to a rapid decrease in network
- [ ] diameter and eventual integration.
- [ ] B. Lack of High Clustering: The basic Barabási–Albert model fails to produce the high local clustering (triadic
- [ ] closure) observed in real-world social and metabolic networks, as it primarily focuses on global
- [x] **connectivity growth.** *(Verified Correct Answer)*
- [ ] C. Infinite Variance in Infinite Networks: In networks where the power-law exponent
- [ ] making
- [ ] standard statistical tools (like those based on Gaussian distributions) difficult or impossible to apply to the
- [x] **network's properties.** *(Verified Correct Answer)*
- [ ] D. The "First-Mover" Bias: The model assumes that the oldest nodes always accumulate the most edges,
- [ ] failing to account for "late-comer" nodes that might become hubs due to superior fitness or functional
- [x] **relevance (the "Fit-get-Richer" phenomenon).** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **connectivity growth., network's properties., relevance (the "Fit-get-Richer" phenomenon).**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 65 [MSQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In a large, regular lattice network, a "shortcut" edge is added between two distant peripheral nodes. Which of the following centrality measures would remain unaffected for the vast majority of nodes in the network (excluding the two nodes directly involved in the new connection)?

**Options:**
- [ ] A. Eigenvector centrality
- [x] **B. Degree centrality** *(Verified Correct Answer)*
- [ ] C. Betweenness centrality
- [x] **D. Clustering coefficient of each unaffected node** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Degree centrality, D. Clustering coefficient of each unaffected node**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 66 [MCQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The following question consists of two statements: an Assertion (A) and a Reason (R). Select the correct answer from the options below: Assertion (A): The Human Genome Project revealed that a large portion of the human genome does not code for proteins. Reason (R): Only a small percentage of human DNA consists of genes that are translated into proteins.

**Options:**
- [x] **A. Both A and R are true, and R is the correct explanation of A** *(Verified Correct Answer)*
- [ ] B. Both A and R are true, but R is not the correct explanation of A
- [ ] C. A is true, but R is false
- [ ] D. A is false, but R is true

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. Both A and R are true, and R is the correct explanation of A**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 67 [MCQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Match the following and choose the correct option

**Options:**
- [x] **A. A–5, B–1, C–3, D–2, E–4** *(Verified Correct Answer)*
- [ ] B. A–1, B–5, C–3, D–2, E–4
- [ ] C. A–5, B–3, C–1, D–2, E–4
- [ ] D. A–4, B–1, C–3, D–5, E–2

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. A–5, B–1, C–3, D–2, E–4**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 68 [MCQ • 2.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Which of the following statements are true regarding enzymes involved in replication? A. Helicase unwinds the DNA double helix B. DNA ligase seals nicks between Okazaki fragments C. Primase synthesises DNA primers D. DNA polymerase I removes RNA primers

**Options:**
- [ ] A. A and B only
- [x] **B. A, B and D** *(Verified Correct Answer)*
- [ ] C. B, C and D

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. A, B and D**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 69 [NAT/SA • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> CONTEXT / PARAGRAPH During Sanger sequencing of a DNA fragment, the sequencing gel shows bands in the following order from bottom to top: G, A, T, C, C, A, G, T, A Based on the above data, answer the given subquestions. What is the end nucleotide of the newly synthesised DNA strand? NOTE: Enter the exact answer without any extra space in the beginning or at the end. Answers Case Sensitive : No

**Numerical / Short Answer:** `G (Set • Alphanumeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **G (Set • Alphanumeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 70 [NAT/SA • 1.00 Marks]
**Source:** `big_data_and_biological_networks_15_mar_26_quizpractice.pdf`

**Question:**
> CONTEXT / PARAGRAPH Consider the following network. Answer the given subquestions. What is the diameter of the given network?

**Numerical / Short Answer:** `4.8 – 5.2 (Range • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **4.8 – 5.2 (Range • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

## 🎙️ Module IV: NotebookLM Deep-Dive Audio Prompt
Copy and paste this exact instruction into NotebookLM's chat or notebook description when generating your **Audio Overview Podcast**:

```text
Act as two expert computer science professors coaching an IIT Madras BS student preparing for Quiz 1 in IITM BS Degree: Big Data and Biological Networks (Quiz 1 Mastery).
Focus deeply on:
1. First-principles explanations of the master formulas and why each term exists.
2. The core distinctions (e.g. Go-Back-N vs Selective Repeat in CN, Universal Gates & Radix Equivalence in CSD, or Molecular Central Dogma vs Network Centralities in BDBN).
3. The common calculation pitfalls and traps students fall into during high-pressure 45-minute timed quizzes.
4. Walk through 3 representative numerical problems step-by-step with intuitive mental models.
Keep the tone energetic, intellectually rigorous, and encouraging.
```

---
*Generated automatically by Fabric OS Meta-Foundry. Ready for direct import into Google NotebookLM.*
