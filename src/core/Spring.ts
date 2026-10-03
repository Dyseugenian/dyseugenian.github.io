export class Spring {
  value = 0;
  target = 0;
  velocity = 0;

  constructor(
    public stiffness: number,
    public damping: number,
  ) {}

  update(dt: number): number {
    const force = (this.target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += force * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
