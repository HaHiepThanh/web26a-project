import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';

/**
 * Layout cho phần đã đăng nhập: có Header (+ sidebar) và Footer bao quanh nội dung.
 * Các trang con render vào <router-outlet/>.
 */
@Component({
  selector: 'app-app-layout',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app-layout.html',
  styleUrl: './app-layout.css',
})
export class AppLayout {}
