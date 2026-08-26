import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddList } from './add-list';

describe('AddList', () => {
  let component: AddList;
  let fixture: ComponentFixture<AddList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddList],
    }).compileComponents();

    fixture = TestBed.createComponent(AddList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('mặc định editing = false và hiển thị nút Add another list', () => {
    expect(component.editing()).toBe(false);
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn.textContent).toContain('Add another list');
  });

  it('chuyển sang editing = true khi gọi startEditing', () => {
    component.startEditing();
    expect(component.editing()).toBe(true);
    expect(component.name()).toBe('');
  });

  it('emit event create khi submit tên hợp lệ', () => {
    const createSpy = vi.spyOn(component.create, 'emit');
    component.startEditing();
    component.name.set('Sprint 1');
    component.submit();

    expect(createSpy).toHaveBeenCalledWith('Sprint 1');
    expect(component.editing()).toBe(false);
  });

  it('huỷ và đóng editing khi submit chuỗi rỗng', () => {
    const createSpy = vi.spyOn(component.create, 'emit');
    component.startEditing();
    component.name.set('   ');
    component.submit();

    expect(createSpy).not.toHaveBeenCalled();
    expect(component.editing()).toBe(false);
  });

  it('huỷ editing khi gọi cancel', () => {
    component.startEditing();
    component.name.set('Pending');
    component.cancel();

    expect(component.editing()).toBe(false);
    expect(component.name()).toBe('');
  });
});
