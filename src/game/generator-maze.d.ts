export interface GeneratorMazeCellWalls {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}

export interface GeneratorMazeCell {
    x: number;
    y: number;
    value: number;
    hex: string;
    digit: number;
    walls: GeneratorMazeCellWalls;
    backtrackDirection: number;
    marker: number;
}

export interface GeneratorMaze {
    seed: number;
    width: number;
    height: number;
    cells: GeneratorMazeCell[];
    rows: GeneratorMazeCell[][];
    solution: string;
}

export function generateGeneratorMaze(seed: number): GeneratorMaze;

export function solveGeneratorMazeSeed(seed: number): string;

export function maybeSolveGeneratorMazeSeed(seed: number | null | undefined): string | null;
