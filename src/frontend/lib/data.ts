// Dummy data for Study Suite

export const courses = [
  { id: "bio101", name: "Biology 101", color: "#4ade80" },
  { id: "spa-a2", name: "Spanish A2", color: "#f472b6" },
  { id: "calc-ii", name: "Calculus II", color: "#60a5fa" },
  { id: "hist-101", name: "World History", color: "#fbbf24" },
];

export interface FileItem {
  id: string;
  name: string;
  type: "folder" | "file" | "media";
  children?: FileItem[];
  lastEdited?: string;
  size?: string;
  content?: string;
  transcript?: string;
}

export const fileTree: FileItem[] = [
  {
    id: "lecture-a",
    name: "Lecture A",
    type: "folder",
    children: [
      {
        id: "intro-video",
        name: "01_Introduction.mp4",
        type: "media",
        lastEdited: "Mar 10, 2026",
        size: "245 MB",
        transcript: `Welcome to Biology 101. In this lecture, we'll explore the fundamental concepts of cell biology.

Cells are the basic unit of life. Every living organism is composed of one or more cells. This was first discovered in 1665 by Robert Hooke, who observed cork under a microscope.

There are two main types of cells:
1. Prokaryotic cells - These lack a nucleus and are found in bacteria and archaea
2. Eukaryotic cells - These have a nucleus and are found in plants, animals, fungi, and protists

The cell membrane, also called the plasma membrane, surrounds all cells and controls what enters and exits. It's composed of a phospholipid bilayer with embedded proteins.

Key organelles we'll study include:
- Nucleus: Contains genetic material (DNA)
- Mitochondria: The powerhouse of the cell, produces ATP
- Endoplasmic Reticulum: Protein and lipid synthesis
- Golgi Apparatus: Modifies and packages proteins
- Ribosomes: Site of protein synthesis

Next lecture, we'll dive deeper into cellular respiration and how cells convert glucose into energy.`,
      },
      {
        id: "notes-1",
        name: "cell_biology_notes.md",
        type: "file",
        lastEdited: "Mar 11, 2026",
        size: "12 KB",
        content: `# Cell Biology Notes

## Key Concepts

### Cell Theory
- All living things are made of cells
- Cells are the basic unit of structure and function
- All cells come from pre-existing cells

### Types of Cells
1. **Prokaryotic**
   - No membrane-bound nucleus
   - Smaller (1-10 μm)
   - Examples: bacteria, archaea

2. **Eukaryotic**
   - Membrane-bound nucleus
   - Larger (10-100 μm)
   - Examples: plants, animals, fungi

## Organelles

| Organelle | Function |
|-----------|----------|
| Nucleus | Stores DNA |
| Mitochondria | ATP production |
| Ribosome | Protein synthesis |
| ER | Protein/lipid synthesis |
| Golgi | Protein packaging |

## Questions to Review
- [ ] What is the difference between rough and smooth ER?
- [ ] How does ATP synthase work?
- [ ] Describe the fluid mosaic model`,
      },
    ],
  },
  {
    id: "lecture-b",
    name: "Lecture B",
    type: "folder",
    children: [
      {
        id: "resp-video",
        name: "02_Cellular_Respiration.mp4",
        type: "media",
        lastEdited: "Mar 12, 2026",
        size: "312 MB",
        transcript: `Today we're going to explore cellular respiration - the process by which cells break down glucose to produce ATP.

The overall equation is:
C6H12O6 + 6O2 → 6CO2 + 6H2O + Energy (ATP)

This process occurs in three main stages:

1. Glycolysis (in the cytoplasm)
   - Glucose is split into two pyruvate molecules
   - Net gain of 2 ATP and 2 NADH

2. Krebs Cycle (in the mitochondrial matrix)
   - Pyruvate is converted to Acetyl-CoA
   - Produces CO2, NADH, FADH2, and ATP

3. Electron Transport Chain (in the inner mitochondrial membrane)
   - NADH and FADH2 donate electrons
   - Creates a proton gradient
   - ATP synthase produces ~34 ATP

Total ATP yield: approximately 36-38 ATP per glucose molecule.

Remember, this is an aerobic process - it requires oxygen. Without oxygen, cells resort to fermentation.`,
      },
      {
        id: "notes-2",
        name: "respiration_notes.md",
        type: "file",
        lastEdited: "Mar 12, 2026",
        size: "8 KB",
        content: `# Cellular Respiration

## Overview
Process of converting glucose to ATP (usable energy)

## Stages

### 1. Glycolysis
- Location: Cytoplasm
- Input: 1 Glucose
- Output: 2 Pyruvate, 2 ATP (net), 2 NADH

### 2. Krebs Cycle
- Location: Mitochondrial matrix
- Also called: Citric Acid Cycle
- Output per cycle: 3 NADH, 1 FADH2, 1 ATP, 2 CO2

### 3. Electron Transport Chain
- Location: Inner mitochondrial membrane
- Produces most ATP (~34)
- Requires oxygen as final electron acceptor

## Key Molecules
- **NAD+/NADH**: Electron carrier
- **FAD/FADH2**: Electron carrier
- **ATP**: Energy currency
- **Acetyl-CoA**: Links glycolysis to Krebs`,
      },
    ],
  },
  {
    id: "assignments",
    name: "Assignments",
    type: "folder",
    children: [
      {
        id: "hw1",
        name: "homework_1.md",
        type: "file",
        lastEdited: "Mar 8, 2026",
        size: "4 KB",
        content: `# Homework 1: Cell Structure

**Due: March 15, 2026**

## Questions

1. Compare and contrast prokaryotic and eukaryotic cells.

2. Describe the structure and function of the mitochondria.

3. Explain the fluid mosaic model of the cell membrane.

4. What role do ribosomes play in protein synthesis?

5. Draw and label a typical animal cell with at least 8 organelles.`,
      },
    ],
  },
  {
    id: "resources",
    name: "Resources",
    type: "folder",
    children: [
      {
        id: "textbook",
        name: "textbook_chapter_1.md",
        type: "file",
        lastEdited: "Feb 28, 2026",
        size: "156 KB",
        content: `# Chapter 1: Introduction to Biology

## 1.1 What is Life?

Biology is the scientific study of life. But what exactly is life? 

All living organisms share certain characteristics:
- Organization
- Metabolism
- Homeostasis
- Growth
- Reproduction
- Response to stimuli
- Evolution

## 1.2 The Hierarchy of Life

Life is organized in a hierarchical manner:

1. Atoms
2. Molecules
3. Organelles
4. Cells
5. Tissues
6. Organs
7. Organ Systems
8. Organisms
9. Populations
10. Communities
11. Ecosystems
12. Biosphere`,
      },
    ],
  },
];

export interface FlashCard {
  id: string;
  front: string;
  back: string;
  category: string;
  nextDate: string;
  easinessFactor: number;
}

export const flashcards: FlashCard[] = [
  {
    id: "fc1",
    front: "What is the powerhouse of the cell?",
    back: "Mitochondria - produces ATP through cellular respiration",
    category: "Cell Biology",
    nextDate: "2026-03-14",
    easinessFactor: 2.5,
  },
  {
    id: "fc2",
    front: "What is the function of ribosomes?",
    back: "Protein synthesis - translating mRNA into amino acid sequences",
    category: "Cell Biology",
    nextDate: "2026-03-15",
    easinessFactor: 2.3,
  },
  {
    id: "fc3",
    front: "Define homeostasis",
    back: "The ability of an organism to maintain a stable internal environment despite external changes",
    category: "General Biology",
    nextDate: "2026-03-13",
    easinessFactor: 2.8,
  },
  {
    id: "fc4",
    front: "What are the three stages of cellular respiration?",
    back: "1. Glycolysis\n2. Krebs Cycle (Citric Acid Cycle)\n3. Electron Transport Chain",
    category: "Metabolism",
    nextDate: "2026-03-16",
    easinessFactor: 2.1,
  },
  {
    id: "fc5",
    front: "What is the difference between prokaryotic and eukaryotic cells?",
    back: "Prokaryotic: No membrane-bound nucleus, smaller, simpler\nEukaryotic: Has nucleus and membrane-bound organelles, larger, more complex",
    category: "Cell Biology",
    nextDate: "2026-03-14",
    easinessFactor: 2.6,
  },
  {
    id: "fc6",
    front: "What is ATP?",
    back: "Adenosine Triphosphate - the primary energy currency of cells",
    category: "Metabolism",
    nextDate: "2026-03-17",
    easinessFactor: 2.9,
  },
  {
    id: "fc7",
    front: "Name the four main types of macromolecules",
    back: "1. Carbohydrates\n2. Lipids\n3. Proteins\n4. Nucleic Acids",
    category: "Biochemistry",
    nextDate: "2026-03-15",
    easinessFactor: 2.4,
  },
  {
    id: "fc8",
    front: "What is the cell membrane composed of?",
    back: "Phospholipid bilayer with embedded proteins (fluid mosaic model)",
    category: "Cell Biology",
    nextDate: "2026-03-18",
    easinessFactor: 2.2,
  },
];

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: string[];
}

export const chatHistory: ChatMessage[] = [
  {
    id: "msg1",
    role: "user",
    content: "Can you explain the electron transport chain in simple terms?",
    timestamp: "10:30 AM",
  },
  {
    id: "msg2",
    role: "assistant",
    content: `The electron transport chain (ETC) is like a molecular assembly line in your mitochondria. Here's a simple breakdown:

**The Setup:**
- Located in the inner mitochondrial membrane
- Consists of protein complexes (I, II, III, IV) and mobile carriers

**How it Works:**
1. NADH and FADH2 (from earlier steps) donate electrons
2. Electrons pass through the protein complexes
3. As they move, protons (H+) are pumped across the membrane
4. This creates a concentration gradient

**The Payoff:**
- Protons flow back through ATP synthase (like water through a dam)
- This rotation powers ATP production
- Oxygen accepts the final electrons, forming water

Think of it as a hydroelectric dam - the electron flow creates the "water pressure" that spins the turbine (ATP synthase) to generate power (ATP)!`,
    timestamp: "10:31 AM",
  },
  {
    id: "msg3",
    role: "user",
    content: "What happens if oxygen isn't available?",
    timestamp: "10:33 AM",
  },
  {
    id: "msg4",
    role: "assistant",
    content: `Great question! Without oxygen, the cell switches to **anaerobic respiration** (fermentation):

**Why oxygen matters:**
- Oxygen is the final electron acceptor in the ETC
- Without it, electrons back up and the whole chain stops
- NADH can't be recycled back to NAD+

**What happens instead:**

1. **Lactic Acid Fermentation** (in muscles, some bacteria)
   - Pyruvate → Lactic acid
   - Regenerates NAD+ to keep glycolysis running
   - This is why your muscles burn during intense exercise!

2. **Alcoholic Fermentation** (in yeast)
   - Pyruvate → Ethanol + CO2
   - Used in brewing and baking

**The Trade-off:**
- Only 2 ATP per glucose (vs ~36-38 with oxygen)
- Much less efficient, but keeps the cell alive temporarily`,
    timestamp: "10:34 AM",
  },
];

export const fileCategories = [
  "All",
  "Cell Biology",
  "Metabolism",
  "General Biology",
  "Biochemistry",
];
