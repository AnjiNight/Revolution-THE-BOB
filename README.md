# Nosso projeto ************
# Revolution-THE-BOB
graph TD
    B[("Bootstrap / Tracker")]

    P1["Peer A<br/>blocos: 1,2,5"]
    P2["Peer B<br/>blocos: 2,3"]
    P3["Peer C<br/>blocos: 1,4,5"]
    P4["Peer D<br/>blocos: 3,4"]
    P5["Peer E<br/>novo, sem blocos"]

    P5 -.->|"1. pede lista de peers"| B
    B -.->|"2. devolve endereços"| P5

    P1 <-->|troca de blocos| P2
    P1 <-->|troca de blocos| P3
    P2 <-->|troca de blocos| P4
    P3 <-->|troca de blocos| P4
    P5 <-->|handshake + download| P1
    P5 <-->|handshake + download| P4

    classDef peer fill:#1f6feb,stroke:#0d419d,color:#fff
    classDef boot fill:#8957e5,stroke:#553098,color:#fff
    class P1,P2,P3,P4,P5 peer
    class B boot
