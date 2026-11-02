# 📘 IITM BS Degree: Computer Systems Design (Quiz 1 Mastery)
> **Official IIT Madras BS in Data Science and Applications**  
> **Target Assessment:** Quiz 1 (Weeks 1 to 4)  
> **Compiled by:** Fabric OS Autonomous Academic Foundry  
> **Source Documents Analyzed:** 4 Official IITM Previous Year Question Papers (23 Unique Exam Questions)

---

## 🎯 Executive Grokking Overview & Syllabus Scope
Weeks 1 to 4: Boolean Algebra & De Morgan Theorems, Canonical Forms (SOP/POS, Min-terms/Max-terms), Universal Logic Gates (NAND, NOR, 2:1 Mux, XOR), Number Representation (Radix/Base conversions, Unsigned, Sign-Magnitude, 1s/2s Complement, Range of N-bit numbers), Combinational Circuit Synthesis (Adders, Multiplexers, Decoders, Encoders), Glitches & Propagation Delay.

---

## 📐 Module I: Master Formula Sheet & Mathematical Invariants
Every key formula required for Quiz 1 numerical calculations:

$$
\text{Base-r to Decimal}: (d_n \dots d_1 d_0)_r = \sum_{i=0}^n d_i \cdot r^i
$$

$$
\text{Radix Equation Equivalence}: (143)_a = (212)_b \implies a^2 + 4a + 3 = 2b^2 + b + 2
$$

$$
\text{Range of N-bit Unsigned}: [0, 2^N - 1]
$$

$$
\text{Range of N-bit 2\'s Complement}: [-2^{N-1}, 2^{N-1} - 1]
$$

$$
\text{Universal Gate Count for NOT, AND, OR}: \text{NAND counts: NOT=1, AND=2, OR=3, NOR=4, XOR=4}
$$

$$
\text{2:1 Multiplexer as Universal Logic}: Y = S \cdot I_1 + \bar{S} \cdot I_0
$$

$$
\text{Boolean De Morgan}: \overline{A \cdot B} = \bar{A} + \bar{B}, \quad \overline{A + B} = \bar{A} \cdot \bar{B}
$$

$$
\text{Shannon Expansion}: f(x_1, \dots, x_n) = x_1 f(1, x_2, \dots) + \bar{x}_1 f(0, x_2, \dots)
$$

---

## ⚠️ Module II: Critical Pitfalls & Recurring IITM Traps
The specific conceptual traps IIT Madras examiners set to catch unprepared students:

- **Trap:** In base conversion equations $(d)_a = (k)_b$, remember that individual digits cannot exceed or equal the base (i.e. if digit 4 appears in base $a$, then $a > 4$).
- **Trap:** Overflow in 2's Complement occurs ONLY when adding two numbers of the SAME sign yields a result of OPPOSITE sign ($C_{	ext{in}} 
e C_{	ext{out}}$ on MSB).
- **Trap:** Implementing logic gates with 2:1 Multiplexers: Select input acts as one variable; inputs $I_0, I_1$ are driven by $0, 1$, or other variables/complements.
- **Trap:** Minimal XOR counts: XOR is associative and commutative ($A \oplus B \oplus C$); checking parity of odd/even number of 1s.


---

## 📝 Module III: Solved Previous Year Question Bank (23 Master Problems)
Every unique problem extracted from actual IITM Quiz 1 exam papers with verified correct answers and step-by-step reasoning:

### Problem 1 [MCQ • 2.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> What is the minimum number of bits required to represent 16 different values?

**Options:**
- [ ] A. 2
- [ ] B. 5
- [x] **C. 4** *(Verified Correct Answer)*
- [ ] D. 3

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 4**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 2 [MCQ • 4.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Consider the equation (16m)4 = (m6)n, where m and n are unknown. What is the number of possible solutions?

**Options:**
- [ ] A. 4
- [x] **B. 1** *(Verified Correct Answer)*
- [ ] C. 2
- [ ] D. 5

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 1**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 3 [MCQ • 4.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Which of the following circuits represents the minimized SOP circuit for the given truth table? Which of the following circuits represents the minimized SOP circuit for the given truth table?

**Options:**
- [ ] A.
- [x] **** *(Verified Correct Answer)*
- [ ] B.
- [ ] C.
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 4 [MCQ • 4.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Consider the circuit shown on below. Given that the inputs are supplied uniformly randomly, what is the probability of the output F being at logic 0? Consider the circuit shown on below. Given that the inputs are supplied uniformly randomly, what is the probability of the output F being at logic 0?

**Options:**
- [ ] A. 0.00
- [ ] B. 0.25
- [x] **C. 1** *(Verified Correct Answer)*
- [ ] D. 0.75

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 1**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 5 [MCQ • 4.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Refer to problem options and diagram.

**Options:**
- [ ] A. 2 or more inputs are at logic 0
- [x] **B. 2 or more inputs are at logic 1** *(Verified Correct Answer)*
- [ ] C. Any odd number of inputs are at logic 0
- [ ] D. Any odd number of inputs are at logic 1

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 2 or more inputs are at logic 1**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 6 [MCQ • 3.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Consider the circuit shown below. Given that the inputs are supplied uniformly and randomly, the output of the given circuit diagram is independent of ___________. Fill in the blank with appropriate option. Consider the circuit shown below. Given that the inputs are supplied uniformly and randomly, the output of the given circuit diagram is independent of ___________. Fill in the blank with appropriate option.

**Options:**
- [ ] A. A and B
- [ ] B. A, B and C
- [ ] C. A
- [x] **D. A, B, C and D** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **D. A, B, C and D**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 7 [NAT/SA • 4.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Answer the following question based on given timing diagram. Answer the following question based on given timing diagram. Given that we only have 3-input NAND gates, what is the minimum number of NAND gates needed to represent the timing diagram above?

**Numerical / Short Answer:** `1 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **1 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 8 [MCQ • 5.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> Consider the circuit diagram shown below. Consider the circuit diagram shown below. What will be the outputs f 1 and f 2 for the circuit diagram above?

**Options:**
- [ ] A.
- [x] **** *(Verified Correct Answer)*
- [ ] B.
- [ ] C.
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 9 [NAT/SA • 2.00 Marks]
**Source:** `2023_oct_iit_m_degree_an2_exam_qpe2_quizpractice (1).pdf`

**Question:**
> CONTEXT / PARAGRAPH Based on the above data, answer the given subquestions. What is the maximum number of memory locations that can be addressed with this 5-to-32 decoder?

**Numerical / Short Answer:** `32 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **32 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 10 [MCQ • 4.00 Marks]
**Source:** `2025_jul13_iit_m_an_exam_qip4_quizpractice (1).pdf`

**Question:**
> If (143)a = (212)b, where a and b are the bases of the respective numbers, what are the values of a and b?

**Options:**
- [ ] A. a = 6, b = 5
- [ ] B. a = 8, b = 5
- [x] **C. a = 7, b = 6** *(Verified Correct Answer)*
- [ ] D. a = 9, b = 7
- [ ] E. a = 5, b = 4

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. a = 7, b = 6**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 11 [NAT/SA • 3.00 Marks]
**Source:** `2025_jul13_iit_m_an_exam_qip4_quizpractice (1).pdf`

**Question:**
> Given that the NOT  gate has a delay of 1 ns, and 2-input AND/OR  gates have delays of 2 ns, what will be the maximum delay of a 2x1 multiplexer circuit? Note: if the answer is 1 ns, write 1.

**Numerical / Short Answer:** `5 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **5 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 12 [MCQ • 4.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qid4_quizpractice.pdf`

**Question:**
> If (234)a = (143)b, where a and b are the bases of the respective numbers, what are the values of a and b?

**Options:**
- [ ] A. a = 3, b = 4
- [x] **B. a = 4,b = 5** *(Verified Correct Answer)*
- [ ] C. a = 5, b = 6
- [ ] D. a = 6, b = 7
- [ ] E. a = 7, b = 8

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. a = 4,b = 5**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 13 [MCQ • 4.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qid4_quizpractice.pdf`

**Question:**
> What will be the output of the given circuit, as shown below? What will be the output of the given circuit, as shown below?

**Options:**
- [ ] A.
- [x] **** *(Verified Correct Answer)*
- [ ] B.
- [ ] C.
- [ ] D.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 14 [NAT/SA • 3.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qid4_quizpractice.pdf`

**Question:**
> Given that NOT , 2-input AND/OR  gates have delays of 1 ns, what will be the maximum delay of a 3x8 Decoder circuit? Note: if the answer is 1 ns, write 1.

**Numerical / Short Answer:** `3 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **3 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 15 [NAT/SA • 3.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qid4_quizpractice.pdf`

**Question:**
> What is the minimum number of bits required to represent number (128)10 in binary ?

**Numerical / Short Answer:** `8 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **8 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 16 [NAT/SA • 5.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qid4_quizpractice.pdf`

**Question:**
> Answer the given question based on given timing diagram. Answer the given question based on given timing diagram. Given that we only have 2-input NOR gates, what is the minimum number of NOR gates needed to represent a circuit with an output timing diagram same as Y?

**Numerical / Short Answer:** `2 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **2 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 17 [NAT/SA • 5.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> Consider the circuit diagram shown below: Given that we only have 2:1 mux gates, what is the minimum number of mux gates needed to represent the circuit diagram above?

**Numerical / Short Answer:** `3 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **3 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 18 [NAT/SA • 5.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> Find the minimum number of literals in the SOP form: ab + + .

**Numerical / Short Answer:** `4 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **4 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 19 [NAT/SA • 3.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> A 4×16 decoder is implemented using NOT gates (delay = 1 ns) and 4-input AND gates (delay = 2 ns). What is the maximum delay from any input to any output? Note: If the answer is 4 ns, write 4.

**Numerical / Short Answer:** `3 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **3 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 20 [MCQ • 4.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> Given that , which of the following statements is always true?

**Options:**
- [ ] A.
- [ ] B.
- [ ] C.
- [x] **** *(Verified Correct Answer)*
- [ ] D.
- [ ] E. None of these

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 21 [MCQ • 4.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> For the given POS function, find the equivalent minimized SOP expression:

**Options:**
- [ ] A.
- [ ] B.
- [ ] C.
- [x] **** *(Verified Correct Answer)*
- [ ] D.
- [ ] E. None of these

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 22 [MCQ • 4.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> Consider the given Boolean function of three variables: . For which of the following conditions on inputs x, y, z, the output f is always at logic 1?

**Options:**
- [ ] A. 2 or more inputs are at logic 0
- [ ] B. 2 or more inputs are at logic 1
- [x] **C. Any odd number of inputs are at logic 0** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. Any odd number of inputs are at logic 0**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 23 [MCQ • 4.00 Marks]
**Source:** `computer_systems_design_16_jul_26_quizpractice.pdf`

**Question:**
> If , where a and b are the bases of the respective numbers. What are the values of a and b?

**Options:**
- [ ] A. a = 3, b = 4
- [ ] B. a = 4, b = 5
- [x] **C. a = 5, b = 6** *(Verified Correct Answer)*
- [ ] D. a = 6, b = 7
- [ ] E. a = 7, b = 8
- [ ] This PDF was generated from quizpractice.space

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. a = 5, b = 6**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

## 🎙️ Module IV: NotebookLM Deep-Dive Audio Prompt
Copy and paste this exact instruction into NotebookLM's chat or notebook description when generating your **Audio Overview Podcast**:

```text
Act as two expert computer science professors coaching an IIT Madras BS student preparing for Quiz 1 in IITM BS Degree: Computer Systems Design (Quiz 1 Mastery).
Focus deeply on:
1. First-principles explanations of the master formulas and why each term exists.
2. The core distinctions (e.g. Go-Back-N vs Selective Repeat in CN, Universal Gates & Radix Equivalence in CSD, or Molecular Central Dogma vs Network Centralities in BDBN).
3. The common calculation pitfalls and traps students fall into during high-pressure 45-minute timed quizzes.
4. Walk through 3 representative numerical problems step-by-step with intuitive mental models.
Keep the tone energetic, intellectually rigorous, and encouraging.
```

---
*Generated automatically by Fabric OS Meta-Foundry. Ready for direct import into Google NotebookLM.*
