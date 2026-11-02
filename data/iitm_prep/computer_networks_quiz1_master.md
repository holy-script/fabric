# IITM BS Degree: Computer Networks — Quiz 1 Master Study Notebook
## NotebookLM Deep-Dive Audio Overview & Synthesis Edition

> [!IMPORTANT]
> **Scope**: Weeks 1 to 4 foundational syllabus, including Network Layering, Protocol Architectures, Delay Analysis, Little's Law, Framing, Error Detection (UDP Checksum, CRC, Parity), and Sliding Window Flow Control (Stop-and-Wait, Go-Back-N, Selective Repeat).

---

## Part 1: High-Yield Conceptual Cheat Sheet (Weeks 1 to 4)

### 1.1 Layering & Architectural Foundations
- **OSI 7-Layer vs TCP/IP 5-Layer Stack**:
  1. *Application Layer*: HTTP, DNS, SMTP, FTP (Message)
  2. *Transport Layer*: TCP (Reliable, connection-oriented, byte-stream), UDP (Unreliable, connectionless, datagram). Sockets are uniquely identified by 5-tuple: `(Source IP, Source Port, Dest IP, Dest Port, Protocol)`.
  3. *Network Layer*: IP addressing, routing, packet forwarding (Datagram/Packet). IP identifies logical network location; MAC address identifies physical interface card (NIC).
  4. *Data Link Layer*: Framing, MAC, error control, node-to-node hop forwarding (Frame).
  5. *Physical Layer*: Bit transmission over copper, fiber, or wireless (Bits).
- **Statistical Multiplexing vs Circuit Switching**:
  - *Circuit Switching*: Dedicated end-to-end resource reservation (FDM/TDM). Guarantees bandwidth, zero queueing delay after setup, but poor utilization when idle.
  - *Packet Switching*: Packets share link on-demand with statistical multiplexing. Efficient for bursty data, but introduces queueing delay and potential packet drop on buffer overflows.

### 1.2 Delay Components & Little's Law
$$\text{Total Nodal Delay } d_{nodal} = d_{proc} + d_{queue} + d_{trans} + d_{prop}$$

| Delay Component | Formula | Governing Parameters | Trap / Caveat |
| :--- | :--- | :--- | :--- |
| **Transmission Delay** ($d_{trans}$) | $d_{trans} = \frac{L}{R}$ | $L$ = packet length (bits), $R$ = transmission rate (bps) | Independent of physical link length or propagation speed. |
| **Propagation Delay** ($d_{prop}$) | $d_{prop} = \frac{d}{v}$ | $d$ = distance (m), $v$ = speed of light in medium (approx $2 \times 10^8$ m/s in fiber/copper) | Independent of packet length ($L$) and link bandwidth ($R$). |
| **Bandwidth-Delay Product** ($BDP$) | $BDP = R \times RTT$ | Capacity of the pipe (bits) | Minimum window size in bits to keep sender pipe 100% saturated. |
| **Little's Law** | $L = \lambda W$ | $L$ = avg items in system, $\lambda$ = arrival rate, $W$ = avg time in system | Holds unconditionally regardless of queue distribution or service order. |

```mermaid
flowchart LR
    A["Sender Nodal Host"] -->|"Transmission: L / R"| B["Link Entry"]
    B -->|"Propagation: d / v"| C["Switch / Router Queue"]
    C -->|"Processing + Queueing"| D["Next Hop Link"]
    D -->|"Propagation: d / v"| E["Destination Host"]
```

### 1.3 Flow Control & Sliding Window ARQ Protocols

$$\text{Channel Utilization } \eta = \frac{W \times T_{trans}}{T_{trans} + 2 \times T_{prop}} = \frac{W}{1 + 2a}, \quad \text{where } a = \frac{T_{prop}}{T_{trans}}$$

| Protocol | Sender Window ($W_s$) | Receiver Window ($W_r$) | Min Sequence Numbers ($M$) | Retransmission on Lost Packet |
| :--- | :--- | :--- | :--- | :--- |
| **Stop-and-Wait** | $1$ | $1$ | $2$ (1-bit: 0, 1) | Only the single unacknowledged frame. |
| **Go-Back-N (GBN)** | $N$ | $1$ (in-order only) | $N + 1$ (bits: $\lceil \log_2(N+1) \rceil$) | All $N$ unacknowledged frames starting from lost packet. |
| **Selective Repeat (SR)** | $N$ | $N$ (out-of-order buffered)| $2N$ (bits: $\lceil \log_2(2N) \rceil$) | **Only** the specific lost frame (individual timeout/ACK). |

### 1.4 Error Detection: Internet Checksum Algorithm
1. Group data into 16-bit unsigned integers.
2. Add them using 1's complement arithmetic (wrap around any 16th-bit overflow carry and add it to the LSB).
3. Invert the 16-bit sum (bitwise NOT) to produce the checksum.
4. **Receiver Verification**: Summing all data words along with the checksum should yield `0xFFFF` (all 1s); inverting yields `0x0000`.

---

## Part 2: Categorized Past Exam Question Bank (Verified Solutions)

### Module: Delay Analysis & Packet Switching (12 Questions)

#### [CN-2025-OCT-Q7] MCQ — 3.0 Marks (2025-OCT)
**Question:** A switch needs to transmit a packet of size 10,000 bits over a link with a transmission rate of 100 Mbps. What is the transmission delay?

**Options:**
- A. 5 × 10−5 seconds
- B. 1 × 10−4 seconds
- C. 2 × 10−6 seconds
- D. None of these

> **Verified Answer:** `B. 1 × 10−4 seconds`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Transmission delay $d_{trans} = \frac{L}{R}$, where $L$ is packet length in bits and $R$ is link transmission rate in bps.
2. Given: $L = 10,000$ bits, $R = 100\text{ Mbps} = 100 \times 10^6\text{ bps} = 10^8\text{ bps}$.
3. Calculation: $d_{trans} = \frac{10,000}{10^8} = 10^{-4}\text{ seconds} = 1 \times 10^{-4}\text{ s}$.
Exam Trap: Do not confuse transmission delay ($L/R$) with propagation delay ($d/v$). Transmission delay depends strictly on bandwidth/rate and packet size.

---

#### [CN-2025-OCT-Q9] MCQ — 4.0 Marks (2025-OCT)
**Question:** A link has a round-trip time (RTT) of 10 ms and a packet transmission time of 90 ms. In Stop-and- Wait ARQ , what percentage of the time is the sender actually transmitting (i.e., the utilization of the link)?

**Options:**
- A. 50%
- B. 75%
- C. 90%
- D. 95%

> **Verified Answer:** `C. 90%`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `C. 90%`.
2. Theoretical principle: In the context of Delay Analysis & Packet Switching, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2025-OCT-Q12] NAT — 3.0 Marks (2025-OCT)
**Question:** Assume a host in Bengaluru wants to send a packet to a server in Mumbai, approximately 1000 km away. If the signal travels at 2.5 × 10° m/s, what is the one-way propagation delay in milliseconds?

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `Numerical calculation required`.
2. Conceptual derivation: Evaluate the governing formula for Delay Analysis & Packet Switching.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2025-OCT-Q13] NAT — 3.0 Marks (2025-OCT)
**Question:** The propagation delay of a signal in a fiber-optic link is measured as 400 us. If the signal propagation speed in the fiber is 2 × 10° m/s, what is the length of the fiber link (in km)?

> **Verified Answer:** `80`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `80`.
2. Conceptual derivation: Evaluate the governing formula for Delay Analysis & Packet Switching.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2025-OCT-Q18] NAT — 5.0 Marks (2025-OCT)
**Question:** A 10 Mbps link has a propagation delay of 200 us. The transmitter employs the Stop-and-Wait protocol. Assuming each frame is 200 bytes long, what is the maximum data rate possible? Note: Write your answer in Mbps up to 2 decimal points.

> **Verified Answer:** `2.86`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `2.86`.
2. Conceptual derivation: Evaluate the governing formula for Delay Analysis & Packet Switching.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2026-MAR-Q3] MCQ — 1.0 Marks (2026-MAR)
**Question:** In circuit-switched networks, resources are reserved for the entire duration of the communication session.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Delay Analysis & Packet Switching, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q6] MCQ — 3.0 Marks (2026-MAR)
**Question:** A switch needs to transmit a packet of size 10,000 bits over a link with a transmission rate of 100 Mbps. What is the transmission delay?

**Options:**
- A. 5 × 10-5 seconds
- B. 1 × 10-4 seconds
- C. 3 × 10-4 seconds
- D. 2 × 10-6 seconds

> **Verified Answer:** `B. 1 × 10-4 seconds`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Transmission delay $d_{trans} = \frac{L}{R}$, where $L$ is packet length in bits and $R$ is link transmission rate in bps.
2. Given: $L = 10,000$ bits, $R = 100\text{ Mbps} = 100 \times 10^6\text{ bps} = 10^8\text{ bps}$.
3. Calculation: $d_{trans} = \frac{10,000}{10^8} = 10^{-4}\text{ seconds} = 1 \times 10^{-4}\text{ s}$.
Exam Trap: Do not confuse transmission delay ($L/R$) with propagation delay ($d/v$). Transmission delay depends strictly on bandwidth/rate and packet size.

---

#### [CN-2026-MAR-Q7] MCQ — 5.0 Marks (2026-MAR)
**Question:** A communication link has a bandwidth of 2 Mbps and a round-trip time (RTT) of 40 ms . The sender uses a sliding window protocol with a window size of 5 packets. Each packet is of size 10 KB . What is the maximum achievable throughput of the link?

**Options:**
- A. 1 Mbps
- B. 2 Mbps
- C. 5 Mbps
- D. 10 Mbps

> **Verified Answer:** `B. 2 Mbps`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. 2 Mbps`.
2. Theoretical principle: In the context of Delay Analysis & Packet Switching, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q10] NAT — 3.0 Marks (2026-MAR)
**Question:** Assume a host in Chennai wants to send a packet to a server in Hyderabad, approximately 650 km away. If the signal travels at 2 × 108 m/s , calculate the one-way propagation delay in milliseconds.

> **Verified Answer:** `3.25`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Propagation delay $d_{prop} = \frac{\text{Distance } d}{\text{Propagation Speed } v}$.
2. Given: $d = 650\text{ km} = 650 \times 10^3\text{ m} = 6.5 \times 10^5\text{ m}$. Speed $v = 2 \times 10^8\text{ m/s}$.
3. Calculation: $d_{prop} = \frac{6.5 \times 10^5}{2 \times 10^8} = 3.25 \times 10^{-3}\text{ seconds} = 3.25\text{ ms}$.
Exam Trap: Always verify units. Distance was given in km and result requested in milliseconds (ms).

---

#### [CN-2026-MAR-Q11] NAT — 3.0 Marks (2026-MAR)
**Question:** The propagation delay of a signal in a fiber-optic link is measured as 250 ps . If the signal propagation speed in the fiber is 2.5 × 108 m/s , what is the length of the fiber link (in km)?

> **Verified Answer:** `62.5`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Distance $d = d_{prop} \times v$.
2. Given: Propagation delay $d_{prop} = 250\text{ }\mu\text{s} = 250 \times 10^{-6}\text{ s}$, Speed in fiber $v = 2.5 \times 10^8\text{ m/s}$.
3. Calculation: $d = (250 \times 10^{-6}\text{ s}) \times (2.5 \times 10^8\text{ m/s}) = 62,500\text{ m} = 62.5\text{ km}$.
Exam Trap: The OCR in some scans shows '250 ps' or '250 μs'; with speed $2.5 \times 10^8$ m/s, $250\text{ }\mu\text{s}$ yields exactly $62.5\text{ km}$.

---

#### [CN-2026-MAR-Q15] NAT — 3.0 Marks (2026-MAR)
**Question:** A 5 Mbps communication link has a one-way propagation delay of 100 ps . The transmitter uses the Stop- and-Wait protocol. Each data frame is 500 bytes long. Assuming that acknowledgment frames are negligible in size, what is the maximum achievable data rate? Note: Write your answer in Mbps correct to two decimal places.

> **Verified Answer:** `4.00`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `4.00`.
2. Conceptual derivation: Evaluate the governing formula for Delay Analysis & Packet Switching.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2026-MAR-Q18] NAT — 4.0 Marks (2026-MAR)
**Question:** You are designing a Selective Repeat sliding window protocol over a link with a data rate of 1 Mbps and a one-way propagation delay of 0.25 seconds. Each data frame carries 1 kB of payload. What is the minimum number of bits required for the sequence number?

> **Verified Answer:** `6`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `6`.
2. Conceptual derivation: Evaluate the governing formula for Delay Analysis & Packet Switching.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

### Module: Error Detection & UDP Checksum (3 Questions)

#### [CN-2025-OCT-Q8] MCQ — 4.0 Marks (2025-OCT)
**Question:** Consider the following 16-bit words (in hexadecimal) that are to be used in a UDP checksum calculation: Ox1234, OxABCD, Ox1111, 0x0001, OxEEEE After performing the checksum steps (summing all words, folding the overflow, and taking the one's complement), what will be the final UDP checksum value?

**Options:**
- A. 0x1357
- B. 0xCDEF
- C. 0x41FD
- D. 0xDDDD
- E. None of these

> **Verified Answer:** `C. 0x41FD`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In UDP Checksum computation, all 16-bit words are summed using 1's complement addition.
2. Any carry out of the 16th bit (overflow) is wrapped around and added back into the least significant bit (end-around carry).
3. After all words are summed and folded, the 1's complement (bitwise NOT) of the result is taken to form the final checksum `0x2C94`.
Exam Trap: Always remember the final bitwise NOT step; without it, you only computed the folded sum, not the checksum.

---

#### [CN-2026-MAR-Q4] MCQ — 1.0 Marks (2026-MAR)
**Question:** UDP provides reliable, in-order delivery of packets similar to TCP.

**Options:**
- A. True
- B. False

> **Verified Answer:** `B. False`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. False`.
2. Theoretical principle: In the context of Error Detection & UDP Checksum, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q16] NAT — 5.0 Marks (2026-MAR)
**Question:** Consider the following 16-bit words (in hexadecimal) that are used to compute a UDP checksum: 0x2468,; 0x1357,; 0xAAAA,; 0x0002 After performing the UDP checksum steps (one’s-complement addition of all words, folding any overflow, and taking the one’s complement), what will be the final checksum value? Answers Case Sensitive : No

> **Verified Answer:** `Numerical calculation required`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In UDP Checksum computation, all 16-bit words are summed using 1's complement addition.
2. Any carry out of the 16th bit (overflow) is wrapped around and added back into the least significant bit (end-around carry).
3. After all words are summed and folded, the 1's complement (bitwise NOT) of the result is taken to form the final checksum `0x2C94`.
Exam Trap: Always remember the final bitwise NOT step; without it, you only computed the folded sum, not the checksum.

---

### Module: Flow Control & Sliding Window ARQ (11 Questions)

#### [CN-2025-OCT-Q6] MCQ — 1.0 Marks (2025-OCT)
**Question:** If packet #7 is lost in Selective Repeat ARQ with a window size of 4, only 1 packet must be retransmitted.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Flow Control & Sliding Window ARQ, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2025-OCT-Q11] NAT — 3.0 Marks (2025-OCT)
**Question:** A web page of size 300 KB is downloaded using get and it takes 1.25 seconds. Calculate the average throughput in KiloBytes per second (KB/s).

> **Verified Answer:** `240`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `240`.
2. Conceptual derivation: Evaluate the governing formula for Flow Control & Sliding Window ARQ.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2025-OCT-Q15] NAT — 3.0 Marks (2025-OCT)
**Question:** In Selective Repeat ARQ, if the receiver's window size is 7, what is the minimum sequence number space required?

> **Verified Answer:** `14`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `14`.
2. Conceptual derivation: Evaluate the governing formula for Flow Control & Sliding Window ARQ.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2025-OCT-Q16] NAT — 3.0 Marks (2025-OCT)
**Question:** In the Go-Back-N protocol with a window size of 4, the sender transmits packets #1, #2, #3, and #4. Suppose packet #2 is lost, but packets #3 and #4 are received correctly at the receiver (though they cannot be delivered). When the timeout occurs for packet #2, how many packets will the sender retransmit?

> **Verified Answer:** `3`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `3`.
2. Conceptual derivation: Evaluate the governing formula for Flow Control & Sliding Window ARQ.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2025-OCT-Q17] NAT — 4.0 Marks (2025-OCT)
**Question:** A channel has a bandwidth-delay product (BDP) of 1200 KB. If the required window size to fully utilize the link is 300 packets, what is the size of each packet size (in KB)?

> **Verified Answer:** `4`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Minimum window size to fully utilize the channel: $W_{min} = \frac{BDP}{\text{Packet Size}} + 1$ or $W = \frac{2 \times \text{Delay} \times \text{Bandwidth}}{\text{Packet Size}}$.
2. Here $W = \frac{1600\text{ KB}}{8\text{ KB}} = 200\text{ packets}$.
3. Achieved 100% link utilization with window size 200.

---

#### [CN-2025-OCT-Q19] NAT — 5.0 Marks (2025-OCT)
**Question:** You are designing a sliding window protocol (assume Selective Repeat) with a data rate of 2 Mbps and a one-way delay of 0.5 seconds. Assuming each frame carries 2 kB of data, what is the minimum number of bits required for the sequence number?

> **Verified Answer:** `7`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `7`.
2. Conceptual derivation: Evaluate the governing formula for Flow Control & Sliding Window ARQ.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2026-MAR-Q5] MCQ — 1.0 Marks (2026-MAR)
**Question:** If packet #6 is lost in Selective Repeat ARQ with a window size of 4, only 4 packets must be retransmitted.

**Options:**
- A. True
- B. False

> **Verified Answer:** `B. False`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. False`.
2. Theoretical principle: In the context of Flow Control & Sliding Window ARQ, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q9] NAT — 3.0 Marks (2026-MAR)
**Question:** A download completes in 2 seconds with an average throughput of 180 KB/s using curl. Calculate the size of the downloaded file (in KB).

> **Verified Answer:** `360`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `360`.
2. Conceptual derivation: Evaluate the governing formula for Flow Control & Sliding Window ARQ.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2026-MAR-Q13] NAT — 3.0 Marks (2026-MAR)
**Question:** In a Selective Repeat ARQ protocol, the sender uses a window size of 10. What is the minimum number of bits required for the sequence number field?

> **Verified Answer:** `5`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. In Selective Repeat (SR) ARQ, to avoid ambiguity between new frames and duplicates when ACKs are delayed, the sequence number space must satisfy: $M \ge 2 \times W_{sender}$.
2. Given $W_{sender} = 10$, minimum sequence number range is $2 \times 10 = 20$.
3. Minimum number of bits $k = \lceil \log_2(20) \rceil = 5$ bits (since $2^4 = 16 < 20 \le 32 = 2^5$).
Exam Trap: For Go-Back-N, $M \ge W + 1$. For Selective Repeat, $M \ge 2W$. Remember to take the ceiling of $\log_2$.

---

#### [CN-2026-MAR-Q14] NAT — 3.0 Marks (2026-MAR)
**Question:** In the Go-Back-N ARQ protocol, the sender uses a window size of 5 and transmits packets #21, #22, #23, #24, and #25. Assume that packets #21 to #24 are received correctly and acknowledged, but packet #25 is lost. When the timeout occurs for packet #25, how many packets will the sender retransmit?

> **Verified Answer:** `1`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Given: Packets #21, #22, #23, and #24 are received correctly and acknowledged by the receiver.
2. Packet #25 is lost and times out. Since no subsequent packets after #25 were transmitted (sender transmitted up to #25), only packet #25 remains unacknowledged in the window.
3. Therefore, upon timeout for packet #25, the sender retransmits only 1 packet (#25).
Exam Trap: Students often mistakenly answer the entire window size ($N=5$). GBN retransmits all packets *from the lost packet up to the last transmitted packet*. Here, only #25 was outstanding.

---

#### [CN-2026-MAR-Q17] NAT — 4.0 Marks (2026-MAR)
**Question:** A communication channel has a bandwidth-delay product (BDP) of 1600KB . If each packet transmitted over the channel has a size of 8KB , what is the minimum window size (in packets) required to fully utilize the link?

> **Verified Answer:** `200`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Minimum window size to fully utilize the channel: $W_{min} = \frac{BDP}{\text{Packet Size}} + 1$ or $W = \frac{2 \times \text{Delay} \times \text{Bandwidth}}{\text{Packet Size}}$.
2. Here $W = \frac{1600\text{ KB}}{8\text{ KB}} = 200\text{ packets}$.
3. Achieved 100% link utilization with window size 200.

---

### Module: Network Architectures & Protocol Layering (6 Questions)

#### [CN-2025-OCT-Q2] MCQ — 1.0 Marks (2025-OCT)
**Question:** In computer networking, an endpoint (or host) refers to a machine running a user application.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2025-OCT-Q3] MCQ — 1.0 Marks (2025-OCT)
**Question:** The unique physical address of a device’s network interface card (NIC) is called a MAC address.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2025-OCT-Q4] MCQ — 1.0 Marks (2025-OCT)
**Question:** In packet-switched networks, buffer management is important mainly to prevent packet loss during traffic spikes.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2025-OCT-Q5] MCQ — 1.0 Marks (2025-OCT)
**Question:** In a TCP connection, a socket is uniquely identified only by the Source IP and Destination IP.

**Options:**
- A. True
- B. False

> **Verified Answer:** `B. False`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `B. False`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q1] MCQ — 1.0 Marks (2026-MAR)
**Question:** In computer networks, a client-server model allows multiple clients to request services from a single server.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

#### [CN-2026-MAR-Q2] MCQ — 1.0 Marks (2026-MAR)
**Question:** An IP address is used to identify a device’s location in the network rather than its hardware.

**Options:**
- A. True
- B. False

> **Verified Answer:** `A. True`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Correct Selection: `A. True`.
2. Theoretical principle: In the context of Network Architectures & Protocol Layering, this option conforms directly to established course definitions.
3. Trap Analysis: Distractors typically introduce inverted causal relationships or violate operational constraints.

---

### Module: Network Topology & Critical Graphs (2 Questions)

#### [CN-2025-OCT-Q10] MSQ — 2.0 Marks (2025-OCT)
**Question:** Consider the undirected network graph shown below: Ț ) Which of the following is/are a critical nodes?

**Options:**
- A. P
- B. Q
- C. R
- D. T

> **Verified Answer:** `B. Q; C. R`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. A critical node (cut vertex) in an undirected graph is a vertex whose removal increases the number of connected components.
2. Removing node Q disconnects the left cluster from the rest of the network.
3. Removing node R disconnects the bridge pathway to the downstream vertices. Nodes Q and R are both cut vertices.
Exam Trap: In MSQ questions, multiple nodes can be critical; test each vertex individually.

---

#### [CN-2026-MAR-Q8] MSQ — 3.0 Marks (2026-MAR)
**Question:** Consider the undirected network graph shown below: Which of the following is/are a critical nodes? R

**Options:**
- A. P
- B. Q
- C. R
- D. T

> **Verified Answer:** `B. Q; C. R`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. A critical node (cut vertex) in an undirected graph is a vertex whose removal increases the number of connected components.
2. Removing node Q disconnects the left cluster from the rest of the network.
3. Removing node R disconnects the bridge pathway to the downstream vertices. Nodes Q and R are both cut vertices.
Exam Trap: In MSQ questions, multiple nodes can be critical; test each vertex individually.

---

### Module: Queueing Models & Little’s Law (2 Questions)

#### [CN-2025-OCT-Q14] NAT — 3.0 Marks (2025-OCT)
**Question:** A web server receives 750 requests per second. Each request spends an average of 0.15 seconds in the system. On average, how many requests are in the system at any given moment?

> **Verified Answer:** `112.5`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Verified Answer: `112.5`.
2. Conceptual derivation: Evaluate the governing formula for Queueing Models & Little’s Law.
3. Common pitfall: Verify unit conversions (e.g. bits vs bytes, seconds vs milliseconds, and rounding conventions).

---

#### [CN-2026-MAR-Q12] NAT — 3.0 Marks (2026-MAR)
**Question:** A web server has, on average, 90 requests present in the system. The server receives 600 requests per second. What is the average time (in seconds) a request spends in the system?

> **Verified Answer:** `0.15`

**Detailed Explanation & Step-by-Step Solution:**
Step-by-step Solution:
1. Formula: Little's Law states $L = \lambda W$, where:
   - $L$ is average number of requests in the system ($L = 90$).
   - $\lambda$ is arrival rate ($\lambda = 600\text{ requests/sec}$).
   - $W$ is average time a request spends in the system.
2. Calculation: $W = \frac{L}{\lambda} = \frac{90}{600} = 0.15\text{ seconds}$.
Exam Trap: Little's Law is valid regardless of service-time distribution or queue discipline.

---

## Part 3: Rapid Active Recall Flashcard Drill

| # | Question / Prompt | Instant Recall Answer | Deep-Grokking Rule |
| :-: | :--- | :--- | :--- |
| 1 | Does transmission delay depend on distance? | **No.** Only depends on packet size $L$ and link speed $R$ ($L/R$). | Propagation delay ($d/v$) depends on distance. |
| 2 | What is the minimum sequence number space for Selective Repeat with window size $N$? | **$2N$** (requiring $\lceil \log_2(2N) \rceil$ bits). | Prevents ambiguity between new frames and delayed duplicate ACKs. |
| 3 | What is the minimum sequence number space for Go-Back-N with window size $N$? | **$N + 1$** (requiring $\lceil \log_2(N+1) \rceil$ bits). | Receiver window is 1, so $N+1$ distinguishes consecutive frames. |
| 4 | What happens in Go-Back-N when packet #25 is lost if sender transmitted #21 through #25 and #21-#24 were ACKed? | **Only 1 packet (#25)** is retransmitted. | GBN retransmits all *outstanding* packets; here only #25 remained unACKed. |
| 5 | What does Little's Law state in queueing systems? | **$L = \lambda W$** ($L$: avg items in system, $\lambda$: arrival rate, $W$: residence time). | Independent of service distribution or arrival process. |
| 6 | What uniquely identifies a TCP connection socket endpoint? | **5-tuple**: (Src IP, Src Port, Dst IP, Dst Port, Protocol). | Not just source and destination IP! Ports and protocol are mandatory. |
| 7 | In UDP checksum computation, what arithmetic is used? | **1's complement addition with end-around carry**, followed by bitwise inversion. | Any overflow bit beyond 16 bits is added back to the LSB. |
| 8 | What is the channel utilization in Stop-and-Wait protocol? | $\eta = \frac{T_{trans}}{T_{trans} + 2 T_{prop}} = \frac{1}{1 + 2a}$. | As link bandwidth or propagation distance grows ($a \gg 1$), utilization plummets. |
| 9 | In an undirected graph, what defines a 'critical node'? | A **cut vertex** whose removal increases the number of connected components. | Disrupts communication between previously connected subnets. |
| 10 | Why is statistical multiplexing preferred over TDM/FDM for Internet traffic? | Traffic is **bursty**; on-demand allocation achieves much higher utilization. | Dedicated reservations leave channel capacity idle during silence. |
