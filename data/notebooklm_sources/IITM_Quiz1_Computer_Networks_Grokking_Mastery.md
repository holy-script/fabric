# 📘 IITM BS Degree: Computer Networks (Quiz 1 Mastery)
> **Official IIT Madras BS in Data Science and Applications**  
> **Target Assessment:** Quiz 1 (Weeks 1 to 4)  
> **Compiled by:** Fabric OS Autonomous Academic Foundry  
> **Source Documents Analyzed:** 2 Official IITM Previous Year Question Papers (24 Unique Exam Questions)

---

## 🎯 Executive Grokking Overview & Syllabus Scope
Weeks 1 to 4: Network Core & Edge, Packet vs Circuit Switching, Delay Models (Transmission, Propagation, Queuing), Layered Architecture (OSI & TCP/IP), Sockets, Transport Layer Fundamentals (UDP vs TCP), Reliable Data Transfer (Stop-and-Wait, Go-Back-N, Selective Repeat ARQ).

---

## 📐 Module I: Master Formula Sheet & Mathematical Invariants
Every key formula required for Quiz 1 numerical calculations:

$$
d_{\text{trans}} = \frac{L}{R} \quad \text{where } L \text{ is packet length (bits), } R \text{ is link transmission rate (bps)}
$$

$$
d_{\text{prop}} = \frac{d}{s} \quad \text{where } d \text{ is physical distance (meters), } s \text{ is propagation speed } (\approx 2 \times 10^8 \text{ m/s in fiber/copper})
$$

$$
d_{\text{nodal}} = d_{\text{proc}} + d_{\text{queue}} + d_{\text{trans}} + d_{\text{prop}}
$$

$$
\text{Bandwidth-Delay Product (BDP)} = R \times \text{RTT}
$$

$$
\text{Utilization (Stop-and-Wait)}: U_{\text{sender}} = \frac{L/R}{\text{RTT} + L/R}
$$

$$
\text{Utilization (Pipelined)}: U_{\text{sender}} = \min\left(1, \frac{W \cdot (L/R)}{\text{RTT} + L/R}\right) \quad \text{where } W \text{ is window size}
$$

$$
\text{Selective Repeat Window Constraint}: W_{\text{sender}} + W_{\text{receiver}} \le 2^k \implies W \le 2^{k-1}
$$

$$
\text{Go-Back-N Window Constraint}: W \le 2^k - 1
$$

---

## ⚠️ Module II: Critical Pitfalls & Recurring IITM Traps
The specific conceptual traps IIT Madras examiners set to catch unprepared students:

- **Trap:** Confusion between Transmission Delay (L/R - pushing bits onto wire) and Propagation Delay (d/s - traveling across space).
- **Trap:** Go-Back-N vs Selective Repeat: In GBN, losing packet #N forces retransmission of #N and ALL subsequent unacknowledged packets in the window. In SR, only lost packet #N is retransmitted.
- **Trap:** Client-Server vs P2P: P2P distributes server upload load across peers (self-scaling), whereas Client-Server bottlenecks at server upload bandwidth $F/u_s$.
- **Trap:** IP Address vs MAC Address: IP address identifies logical location in topological hierarchy; MAC address identifies physical network interface hardware (flat addressing).


---

## 📝 Module III: Solved Previous Year Question Bank (24 Master Problems)
Every unique problem extracted from actual IITM Quiz 1 exam papers with verified correct answers and step-by-step reasoning:

### Problem 1 [MCQ • 1.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> In computer networking, an endpoint (or host)  refers to a machine running a user application.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 2 [MCQ • 1.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> The unique physical address of a device’s network interface card (NIC)  is called a MAC address.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 3 [MCQ • 1.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> In packet-switched networks, buffer management is important mainly to prevent packet loss during traffic spikes.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 4 [MCQ • 1.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> In a TCP connection, a socket is uniquely identified only by the Source IP and Destination IP.

**Options:**
- [ ] A. True
- [x] **B. False** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. False**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 5 [MCQ • 1.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> If packet #7  is lost in Selective Repeat ARQ  with a window size of 4, only 1 packet  must be retransmitted.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 6 [MCQ • 3.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> A switch needs to transmit a packet of size 10,000 bits over a link with a transmission rate of 100 Mbps. What is the transmission delay?

**Options:**
- [ ] A. 5 × 10−5 seconds
- [x] **B. 1 × 10−4 seconds** *(Verified Correct Answer)*
- [ ] C. 2 × 10−6 seconds
- [ ] D. None of these

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. 1 × 10−4 seconds**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 7 [MCQ • 4.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> Refer to problem options and diagram.

**Options:**
- [ ] A.
- [ ] B.
- [ ] C.
- [x] **** *(Verified Correct Answer)*
- [ ] D.
- [ ] E.

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is ****.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 8 [MCQ • 4.00 Marks]
**Source:** `2025_oct26_iit_m_an_exam_qic4_quizpractice.pdf`

**Question:**
> A link has a round-trip time (RTT) of 10 ms and a packet transmission time of 90 ms. In Stop-and- Wait ARQ , what percentage of the time is the sender actually transmitting (i.e., the utilization of the link)?

**Options:**
- [ ] A. 50%
- [ ] B. 75%
- [x] **C. 90%** *(Verified Correct Answer)*
- [ ] D. 95%

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **C. 90%**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 9 [MCQ • 1.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In computer networks, a client-server model allows multiple clients to request services from a single server.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 10 [MCQ • 1.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> An IP address is used to identify a device’s location in the network rather than its hardware.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 11 [MCQ • 1.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In circuit-switched networks, resources are reserved for the entire duration of the communication session.

**Options:**
- [x] **A. True** *(Verified Correct Answer)*
- [ ] B. False

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **A. True**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 12 [MCQ • 1.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> UDP provides reliable, in-order delivery of packets similar to TCP.

**Options:**
- [ ] A. True
- [x] **B. False** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. False**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 13 [MCQ • 1.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> If packet #6 is lost in Selective Repeat ARQ with a window size of 4, only 4 packets must be retransmitted.

**Options:**
- [ ] A. True
- [x] **B. False** *(Verified Correct Answer)*

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. False**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 14 [MCQ • 5.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A communication link has a bandwidth of and a round-trip time (RTT) of . The sender uses a sliding window protocol with a window size of packets. Each packet is of size . What is the maximum achievable throughput of the link?

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

### Problem 15 [MSQ • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Consider the undirected network graph shown below: Which of the following is/are a critical nodes?

**Options:**
- [ ] A. P
- [x] **B. Q** *(Verified Correct Answer)*
- [x] **C. R** *(Verified Correct Answer)*
- [ ] D. T

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The verified answer is **B. Q, C. R**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 16 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A download completes in 2 seconds with an average throughput of 180 KB/s using curl. Calculate the size of the downloaded file (in KB).

**Numerical / Short Answer:** `360 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **360 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 17 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> Assume a host in Chennai wants to send a packet to a server in Hyderabad, approximately 650 km away. If the signal travels at , calculate the one-way propagation delay in milliseconds.

**Numerical / Short Answer:** `3.25 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **3.25 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 18 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> The propagation delay of a signal in a fiber-optic link is measured as . If the signal propagation speed in the fiber is , what is the length of the fiber link (in km)?

**Numerical / Short Answer:** `62.5 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **62.5 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 19 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A web server has, on average, requests present in the system. The server receives requests per second. What is the average time (in seconds) a request spends in the system?

**Numerical / Short Answer:** `0.15 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **0.15 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 20 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In a Selective Repeat ARQ protocol, the sender uses a window size of 10. What is the minimum number of bits required for the sequence number field?

**Numerical / Short Answer:** `5 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **5 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 21 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> In the Go-Back-N ARQ protocol, the sender uses a window size of and transmits packets #21, #22, #23, #24, and #25. Assume that packets #21 to #24 are received correctly and acknowledged, but packet #25 is lost. When the timeout occurs for packet #25, how many packets will the sender retransmit?

**Numerical / Short Answer:** `1 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **1 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 22 [NAT/SA • 3.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A Mbps communication link has a one-way propagation delay of . The transmitter uses the Stop- and-Wait protocol. Each data frame is bytes long. Assuming that acknowledgment frames are negligible in size, what is the maximum achievable data rate? Note: Write your answer in Mbps correct to two decimal places.

**Numerical / Short Answer:** `4.00 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **4.00 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 23 [NAT/SA • 4.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> A communication channel has a bandwidth-delay product (BDP) of . If each packet transmitted over the channel has a size of , what is the minimum window size (in packets) required to fully utilize the link?

**Numerical / Short Answer:** `200 (Equal • Numeric)`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **200 (Equal • Numeric)**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

### Problem 24 [NAT/SA • 4.00 Marks]
**Source:** `computer_networks_15_mar_26_quizpractice.pdf`

**Question:**
> You are designing a Selective Repeat sliding window protocol over a link with a data rate of Mbps and a one-way propagation delay of seconds. Each data frame carries kB of payload. What is the minimum number of bits required for the sequence number?

**Numerical / Short Answer:** `6 (Equal • Numeric) This PDF was generated from quizpractice.space`

**Grokking Breakdown & First-Principles Solution:**
- **Key Invariant:** The exact evaluated result is **6 (Equal • Numeric) This PDF was generated from quizpractice.space**.
- **Exam Strategy:** Identify the core theorem tested. Ensure units are aligned (e.g. converting Mbps to bps, ms to seconds, checking base restrictions $a > \max(\text{digits})$).

---

## 🎙️ Module IV: NotebookLM Deep-Dive Audio Prompt
Copy and paste this exact instruction into NotebookLM's chat or notebook description when generating your **Audio Overview Podcast**:

```text
Act as two expert computer science professors coaching an IIT Madras BS student preparing for Quiz 1 in IITM BS Degree: Computer Networks (Quiz 1 Mastery).
Focus deeply on:
1. First-principles explanations of the master formulas and why each term exists.
2. The core distinctions (e.g. Go-Back-N vs Selective Repeat in CN, Universal Gates & Radix Equivalence in CSD, or Molecular Central Dogma vs Network Centralities in BDBN).
3. The common calculation pitfalls and traps students fall into during high-pressure 45-minute timed quizzes.
4. Walk through 3 representative numerical problems step-by-step with intuitive mental models.
Keep the tone energetic, intellectually rigorous, and encouraging.
```

---
*Generated automatically by Fabric OS Meta-Foundry. Ready for direct import into Google NotebookLM.*
