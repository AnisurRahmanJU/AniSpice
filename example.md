# AniSpice Circuit Examples

## 1. DC Resistor Circuits

### 1. Voltage divider

Plot `v(out)` in the DC tab: it is exactly half the input.

```spice
* Voltage divider
V1 in 0 DC 10
R1 in out 1k
R2 out 0 1k
.op
.dc V1 0 10 1
.end
```

### 2. Series resistors

Current is identical through all three; check `i(R1)`, `i(R2)`, `i(R3)`.

```spice
* Series resistors
V1 1 0 DC 12
R1 1 2 1k
R2 2 3 2.2k
R3 3 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 3. Parallel resistors

Branch currents add up to the source current.

```spice
* Three parallel branches
V1 in 0 DC 12
R1 in 0 1k
R2 in 0 2.2k
R3 in 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 4. Loaded voltage divider

Compare `v(mid)` with and without `RL`.

```spice
* Loaded voltage divider
V1 vcc 0 DC 12
R1 vcc mid 10k
R2 mid 0 10k
R3 mid 0 4.7k
.op
.dc V1 0 12 1
.end
```

### 5. Wheatstone bridge

`R4` is slightly off balance, so the bridge detector `Rg` sees a small voltage.

```spice
* Wheatstone bridge
V1 top 0 DC 10
R1 top a 1k
R2 top b 1k
R3 a 0 1k
R4 b 0 1.1k
Rg a b 10k
.op
.dc V1 0 10 1
.end
```

### 6. Superposition with two sources

```spice
* Superposition: two voltage sources
V1 1 0 DC 10
V2 3 0 DC 5
R1 1 2 1k
R2 2 0 2k
R3 3 2 1k
.op
.dc V1 0 10 1
.end
```

### 7. Current source feeding a resistor network

```spice
* Current source network
I1 0 1 DC 1m
R1 1 0 4.7k
R2 1 2 1k
R3 2 0 2.2k
.op
.dc I1 0 2m 0.1m
.end
```

### 8. R-2R ladder DAC (3 bit, code 101)

Expected output: 5 V × 5/8 = 3.125 V at `n2`.

```spice
* R-2R ladder DAC, code 101
Vb2 b2 0 DC 5
Vb1 b1 0 DC 0
Vb0 b0 0 DC 5
R2b b2 n2 20k
R1b b1 n1 20k
R0b b0 n0 20k
Rt n0 0 20k
Ra n0 n1 10k
Rb n1 n2 10k
.op
.end
```

### 9. Delta network with loads

```spice
* Delta resistor network with loads
V1 a 0 DC 10
R1 a b 1k
R2 b c 1k
R3 c a 1k
R4 b 0 2.2k
R5 c 0 2.2k
.op
.dc V1 0 10 1
.end
```

### 10. Maximum power transfer

Power in `RL` is highest when `RL = Rs` (see the P column in the operating-point table).

```spice
* Maximum power transfer RL = Rs
Vs 1 0 DC 10
R1 1 2 50
R2 2 0 50
.op
.dc Vs 0 10 1
.end
```

## 2. Transient: RC, RL, RLC

### 11. RC charge and discharge (square wave)

Time constant is 1 ms.

```spice
* RC charge/discharge
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 1k
C1 out 0 1u
.tran 20u 10m
.end
```

### 12. Slow RC (τ = 1 ms with 10 kΩ and 100 nF)

```spice
* RC time constant 1 ms
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 10k
C1 out 0 100n
.tran 20u 10m
.end
```

### 13. RL step response

Time constant L/R = 0.1 ms. Plot `i(L1)`.

```spice
* RL step response
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in out 100
L1 out 0 10m
.tran 5u 1m
.end
```

### 14. RC differentiator

```spice
* RC differentiator
V1 in 0 PULSE(0 5 0 1n 1n 1m 2m)
C1 in out 10n
R1 out 0 10k
.tran 5u 4m
.end
```

### 15. RC integrator (square wave to triangle)

```spice
* RC integrator
V1 in 0 PULSE(-1 1 0 1n 1n 50u 100u)
R1 in out 100k
C1 out 0 10n
.tran 0.5u 1m
.end
```

### 16. Series RLC, underdamped

Overshoot and ringing at about 1.6 kHz.

```spice
* Series RLC underdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 10
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 17. Series RLC, overdamped

```spice
* Series RLC overdamped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 1k
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 18. Series RLC, critically damped

R = 2·√(L/C) = 200 Ω.

```spice
* Series RLC critically damped
V1 in 0 PULSE(0 1 0 1n 1n 5m 10m)
R1 in a 200
L1 a b 10m
C1 b 0 1u
.tran 5u 2m
.end
```

### 19. Parallel RLC ringing (current impulse)

```spice
* Parallel RLC impulse response
I1 0 n PULSE(0 1m 0 1n 1n 20u 1)
R1 n 0 100
L1 n 0 1m
C1 n 0 1u
.tran 1u 2m
.end
```

### 20. Two-stage RC network

```spice
* Two-stage RC low-pass step
V1 in 0 PULSE(0 5 0 1n 1n 5m 10m)
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 1u
.tran 20u 10m
.end
```

### 21. Capacitor charged through a Thevenin divider

Final value is the divider voltage, not the supply.

```spice
* Capacitor charging via divider
V1 in 0 DC 10
R1 in a 10k
R2 a 0 10k
C1 a 0 1u
.tran 50u 50m
.end
```

### 22. Charge sharing between two capacitors

```spice
* Coupled RC stages
V1 in 0 PULSE(0 5 0 1n 1n 10m 20m)
R1 in a 1k
C1 a 0 1u
R2 a b 1k
C2 b 0 2u
.tran 50u 20m
.end
```

## 3. AC Frequency Response and Filters

### 23. RC low-pass (fc ≈ 1.59 kHz)

```spice
* RC low-pass
V1 in 0 AC 1
R1 in out 1k
C1 out 0 100n
.ac dec 50 10 1meg
.end
```

### 24. RC high-pass

```spice
* RC high-pass
V1 in 0 AC 1
C1 in out 100n
R1 out 0 1k
.ac dec 50 10 1meg
.end
```

### 25. RL low-pass

fc = R/(2πL) ≈ 1.59 kHz.

```spice
* RL low-pass
V1 in 0 AC 1
L1 in out 10m
R1 out 0 100
.ac dec 50 10 1meg
.end
```

### 26. RL high-pass

```spice
* RL high-pass
V1 in 0 AC 1
R1 in out 100
L1 out 0 10m
.ac dec 50 10 1meg
.end
```

### 27. Series RLC band-pass (Q = 10)

Output is taken across `R1`.

```spice
* Series RLC band-pass
V1 in 0 AC 1
L1 in a 10m
C1 a out 1u
R1 out 0 10
.ac dec 100 100 100k
.end
```

### 28. Series LC notch (band-stop)

```spice
* LC notch at 1.59 kHz
V1 in 0 AC 1
R1 in out 100
L1 out m 10m
C1 m 0 1u
.ac dec 100 100 100k
.end
```

### 29. Parallel LC resonant band-pass

```spice
* Parallel resonant band-pass
V1 in 0 AC 1
R1 in out 1k
L1 out 0 10m
C1 out 0 1u
.ac dec 100 100 100k
.end
```

### 30. Second-order LC low-pass

```spice
* Second-order LC low-pass
V1 in 0 AC 1
L1 in out 10m
C1 out 0 1u
R1 out 0 50
.ac dec 50 100 100k
.end
```

### 31. Second-order CL high-pass

```spice
* Second-order high-pass
V1 in 0 AC 1
C1 in out 1u
L1 out 0 10m
R1 out 0 100
.ac dec 50 100 100k
.end
```

### 32. Twin-T notch filter (fn ≈ 1.59 kHz)

```spice
* Twin-T notch
V1 in 0 AC 1
R1 in a 10k
R2 a out 10k
C3 a 0 20n
C1 in b 10n
C2 b out 10n
R3 b 0 5k
R4 out 0 1meg
.ac dec 100 10 100k
.end
```

### 33. Wien bridge network (peak gain 1/3 at 1.59 kHz)

```spice
* Wien network band-pass
V1 in 0 AC 1
R1 in a 10k
C1 a out 10n
R2 out 0 10k
C2 out 0 10n
.ac dec 100 10 100k
.end
```

### 34. Two-stage RC low-pass (−40 dB/dec)

```spice
* Cascaded RC low-pass
V1 in 0 AC 1
R1 in a 1k
C1 a 0 100n
R2 a out 1k
C2 out 0 100n
.ac dec 50 10 1meg
.end
```

### 35. Three-stage RC phase-shift network

The phase plot reaches 180° of lead near 650 Hz (1/(2πRC√6)), where the gain is about 1/29.

```spice
* Three-stage RC phase shifter
V1 in 0 AC 1
C1 in a 10n
R1 a 0 10k
C2 a b 10n
R2 b 0 10k
C3 b out 10n
R3 out 0 10k
.ac dec 100 10 100k
.end
```

### 36. Lead network

```spice
* Lead network
V1 in 0 AC 1
R1 in out 10k
C1 in out 10n
R2 out 0 1k
.ac dec 50 10 1meg
.end
```

### 37. Lag network

```spice
* Lag network
V1 in 0 AC 1
R1 in out 10k
R2 out m 1k
C1 m 0 100n
.ac dec 50 1 100k
.end
```

### 38. Pi (C-L-C) filter between 50 Ω terminations

```spice
* Pi filter 50 ohm
V1 src 0 AC 1
R1 src in 50
C1 in 0 1u
L1 in out 10m
C2 out 0 1u
R2 out 0 50
.ac dec 50 100 1meg
.end
```

## 4. Diodes and Rectifiers

### 39. Diode forward I-V curve

```spice
* Diode forward I-V
V1 in 0 DC 0
R1 in a 100
D1 a 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 5 0.05
.end
```

### 40. Reverse-biased diode

```spice
* Diode reverse and forward sweep
V1 in 0 DC -5
R1 in a 1k
D1 a 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 -10 5 0.25
.end
```

### 41. Half-wave rectifier (no filter)

```spice
* Half-wave rectifier
V1 in 0 SIN(0 5 50)
D1 in out DX
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 42. Half-wave rectifier with filter capacitor

```spice
* Half-wave rectifier with filter
V1 in 0 SIN(0 5 50)
D1 in out DX
C1 out 0 10u
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 43. Full-wave bridge rectifier

```spice
* Full-wave bridge rectifier
V1 a b SIN(0 10 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
R2 p 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 44. Center-tapped full-wave rectifier

```spice
* Center-tapped full-wave rectifier
V1 a 0 SIN(0 10 50)
V2 b 0 SIN(0 10 50 0 0 180)
D1 a out DX
D2 b out DX
R1 out 0 1k
.model DX D(Is=1e-14 N=1)
.tran 0.1m 60m
.end
```

### 45. Positive clipper (limits at about +0.7 V)

```spice
* Diode clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 46. Bidirectional clipper (±0.7 V)

```spice
* Bidirectional clipper
V1 in 0 SIN(0 5 1k)
R1 in out 1k
D1 out 0 DX
D2 0 out DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 47. Biased clipper (limits near 2.7 V)

```spice
* Biased clipper
V1 in 0 SIN(0 5 1k)
Vb ref 0 DC 2
R1 in out 1k
D1 out ref DX
.model DX D(Is=1e-14 N=1)
.tran 5u 3m
.end
```

### 48. Diode clamper (DC restorer)

The signal is shifted upward so its negative peaks are clamped at about −0.7 V; compare `v(in)` with `v(out)`.

```spice
* Diode clamper
V1 in 0 SIN(0 5 1k)
C1 in out 10u
D1 0 out DX
R1 out 0 100k
.model DX D(Is=1e-14 N=1)
.tran 5u 10m
.end
```

### 49. Voltage doubler

Output approaches about 2·Vpeak minus diode drops.

```spice
* Voltage doubler
V1 in 0 SIN(0 5 1k)
C1 in a 1u
D1 0 a DX
D2 a out DX
C2 out 0 1u
R1 out 0 10k
.model DX D(Is=1e-14 N=1)
.tran 10u 30m
.end
```

### 50. Three series diodes as a voltage reference

Output `v(a)` is about 2 V.

```spice
* Series diode reference
V1 in 0 DC 9
R1 in a 1k
D1 a b DX
D2 b c DX
D3 c 0 DX
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 9 0.25
.end
```

### 51. Diode AND gate

```spice
* Diode AND gate
Vcc vcc 0 DC 5
Va a 0 PULSE(0 5 0 1n 1n 1m 2m)
Vb b 0 PULSE(0 5 0 1n 1n 2m 4m)
R1 vcc y 1k
D1 y a DX
D2 y b DX
.model DX D(Is=1e-14 N=1)
.tran 20u 4m
.end
```

### 52. Diode OR gate

```spice
* Diode OR gate
Va a 0 PULSE(0 5 0 1n 1n 1m 2m)
Vb b 0 PULSE(0 5 0 1n 1n 2m 4m)
D1 a y DX
D2 b y DX
R1 y 0 1k
.model DX D(Is=1e-14 N=1)
.tran 20u 4m
.end
```

### 53. LED with current-limiting resistor

```spice
* LED driver
Vs 1 0 DC 5
R1 1 a 330
D1 a 0 LED
.model LED D(Is=1e-18 N=2)
.op
.dc Vs 0 5 0.1
.end
```

### 54. Schottky versus silicon diode

The Schottky (`DS`) conducts at a lower voltage.

```spice
* Schottky vs silicon
V1 in 0 DC 0
R1 in a 100
D1 a 0 DS
R2 in b 100
D2 b 0 DX
.model DS D(Is=1e-8 N=1.05)
.model DX D(Is=1e-14 N=1)
.op
.dc V1 0 5 0.05
.end
```

## 5. Source Waveforms

### 55. Exponentially damped sine

```spice
* Damped sine source
V1 in 0 SIN(0 5 1k 0 500 0)
R1 in 0 1k
.tran 5u 5m
.end
```

### 56. Square wave through an RC low-pass (harmonic filtering)

```spice
* Square wave into RC filter
V1 in 0 PULSE(0 5 0 1n 1n 0.5m 1m)
R1 in out 1.6k
C1 out 0 100n
.tran 5u 5m
.end
```

### 57. Arbitrary PWL stimulus

```spice
* PWL source into RC
V1 in 0 PWL(0 0 1m 0 1.1m 5 3m 5 3.1m 0 5m 0)
R1 in out 1k
C1 out 0 1u
.tran 10u 6m
.end
```

### 58. Two series sine sources (100 Hz beat)

```spice
* Beat between 1 kHz and 1.1 kHz
V1 a 0 SIN(0 1 1k)
V2 b a SIN(0 1 1.1k)
R1 b 0 1k
.tran 10u 20m
.end
```

## 6. Applications

### 59. Bridge rectifier with reservoir capacitor (ripple)

```spice
* Bridge rectifier with filter cap
V1 a b SIN(0 12 50)
R1 b 0 1meg
D1 a p DX
D2 b p DX
D3 0 a DX
D4 0 b DX
C1 p 0 470u
R2 p 0 100
.model DX D(Is=1e-14 N=1)
.tran 0.1m 100m
.end
```

### 60. Series-pass regulator (LED reference)

Output stays near 1.2 V once the input is high enough.

```spice
* Series-pass regulator
Vin vin 0 DC 15
R1 vin b 2.2k
D1 b 0 LED
Q1 vin b out QN
R2 out 0 1k
.model LED D(Is=1e-18 N=2)
.model QN NPN(Is=1e-14 Bf=200)
.op
.dc Vin 0 15 0.25
.end
```

### 61. Third-order Butterworth LC low-pass (fc = 1 kHz, 50 Ω)

```spice
* 3rd-order Butterworth LC low-pass
V1 src 0 AC 1
R1 src in 50
C1 in 0 3.18u
L1 in out 15.9m
C2 out 0 3.18u
R2 out 0 50
.ac dec 50 100 100k
.end
```

### 62. LC delay line (4 sections, Z0 ≈ 32 Ω)

The pulse arrives about 32 µs later per section.

```spice
* LC delay line
V1 src 0 PULSE(0 1 0 1u 1u 200u 1m)
R1 src a 32
C1 a 0 1u
L1 a b 1m
C2 b 0 1u
L2 b c 1m
C3 c 0 1u
L3 c d 1m
C4 d 0 1u
R2 d 0 32
.tran 1u 500u
.end
```
